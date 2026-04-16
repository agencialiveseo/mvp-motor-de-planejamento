import type { DemandItem, Pilot, PilotSchedule, DistributionResult, AllocationItem, Priority } from '../types';
import { UP_CONSTANTS } from '../constants/productions';
import { getWorkdays } from './dates';

const TOLERANCE = 0.05;

/** Returns the valid day index bounds [startDay, endDay] for a given priority level.
 *  alta → first two calendar weeks (workdays 0–9)
 */
function getPriorityBounds(priority: Priority, numWorkdays: number): [number, number] {
  const maxD = numWorkdays - 1;
  switch (priority) {
    case 'alta': return [0, Math.min(9, maxD)];
    default:     return [0, maxD];
  }
}

/** Allocates a single item unit (quantity = 1). */
function allocate(
  schedules: PilotSchedule[],
  pilotIdx: number,
  dayIdx: number,
  item: DemandItem,
  up: number,
  pilotAllocated: number[],
  missedDirectional = false
) {
  const alloc: AllocationItem = {
    demandId: item.id,
    client: item.client,
    type: item.type,
    quantity: 1,
    up,
    priority: item.priority,
    missedDirectional: missedDirectional || undefined,
  };
  schedules[pilotIdx].days[dayIdx].items.push(alloc);
  schedules[pilotIdx].days[dayIdx].totalUP += up;
  pilotAllocated[pilotIdx] += up;
}

/**
 * Pre-assigns items that have MULTIPLE preferred pilots to a single pilot each,
 * distributing proportionally based on each pilot's targetUP.
 *
 * This ensures both pilots receive items from day 1 (Change 6).
 */
function assignMultiPilotItems(items: DemandItem[], pilots: Pilot[]): DemandItem[] {
  type GroupData = {
    pilotIndices: number[];
    count: number[];
    itemIndices: number[];
  };
  const groups = new Map<string, GroupData>();

  items.forEach((item, idx) => {
    const prefIds = item.preferredPilotIds ?? [];
    if (prefIds.length <= 1) return;

    const sortedIds = [...prefIds].sort();
    const pilotIndices = sortedIds
      .map(id => pilots.findIndex(p => p.id === id))
      .filter(i => i >= 0);
    if (pilotIndices.length <= 1) return;

    const key = sortedIds.join('|');
    if (!groups.has(key)) {
      groups.set(key, { pilotIndices, count: new Array(pilotIndices.length).fill(0), itemIndices: [] });
    }
    groups.get(key)!.itemIndices.push(idx);
  });

  if (groups.size === 0) return items;

  const result = [...items];

  groups.forEach(({ pilotIndices, count, itemIndices }) => {
    const totalTarget = pilotIndices.reduce((s, i) => s + pilots[i].minUP, 0);

    itemIndices.forEach(idx => {
      const item = items[idx];
      const totalAssigned = count.reduce((s, a) => s + a, 0) || 1e-10;

      // Pick the pilot with the highest "debt" (proportion needed − proportion assigned so far).
      // This is a Bresenham-like proportional distribution.
      let bestJ = 0;
      let bestDebt = -Infinity;
      for (let j = 0; j < pilotIndices.length; j++) {
        const proportion = pilots[pilotIndices[j]].minUP / totalTarget;
        const debt = proportion - count[j] / totalAssigned;
        if (debt > bestDebt) { bestDebt = debt; bestJ = j; }
      }

      count[bestJ]++;
      result[idx] = { ...item, preferredPilotIds: [pilots[pilotIndices[bestJ]].id] };
    });
  });

  return result;
}

/**
 * Distributes unitized demand items across pilots (V6 Algorithm)
 *
 * Changes vs V5:
 *  1. Front-loading: days fill to targetUP before a new day starts (4-pass selection).
 *  4. No overflow weeks: directed items that can't fit in their preferred week go to
 *     unassigned for the engineer to manually redirect.
 *  5. emptyDays included in idlePilots for actionable alert.
 *  6. Multi-pilot items pre-assigned proportionally so both pilots start from day 1.
 */
export function distribute(
  demandItems: DemandItem[],
  pilots: Pilot[],
  year: number,
  month: number
): DistributionResult {
  const workdays = getWorkdays(year, month);
  const numWorkdays = workdays.length;
  const numPilots = pilots.length;

  const schedules: PilotSchedule[] = pilots.map((pilot) => ({
    pilot,
    days: workdays.map((date) => ({ date, items: [], totalUP: 0 })),
  }));

  const pilotCapacities = pilots.map((p) => p.minUP * numWorkdays);
  const totalCapacityUP = pilotCapacities.reduce((s, c) => s + c, 0);

  // 1. Expand demands into quantity=1 blocks
  const expandedItems: DemandItem[] = [];
  demandItems.forEach((baseItem) => {
    const qty = Math.round(baseItem.quantity);
    for (let i = 0; i < qty; i++) {
      expandedItems.push({
        ...baseItem,
        originalIndex: baseItem.originalIndex,
        quantity: 1,
        upPerUnit: 1 / UP_CONSTANTS[baseItem.type],
      });
    }
  });

  const totalDemandUP = expandedItems.reduce((sum, item) => sum + item.upPerUnit, 0);
  const directionalStats = { requested: 0, obeyed: 0, overflowed: 0 };
  const unassignedItems: AllocationItem[] = [];

  if (expandedItems.length === 0 || numPilots === 0 || numWorkdays === 0) {
    return {
      schedules, totalDemandUP: 0, totalCapacityUP, allocatedUP: 0,
      coveragePercent: 0, workdays, status: 'idle', diffUP: totalCapacityUP,
      directionalStats, unassignedItems, idlePilots: [],
    };
  }

  const pilotAllocated = new Array(numPilots).fill(0);

  const dailyClientsArray = pilots.map(() =>
    workdays.map(() => new Set<string>())
  );

  // Se todas as demandas têm prioridade 'alta', tratar todas como Livre
  // ("se tudo é prioridade, nada é prioridade entre si")
  const allAreAlta = expandedItems.length > 0 && expandedItems.every(i => i.priority === 'alta');
  if (allAreAlta) {
    expandedItems.forEach(i => { i.priority = null; });
  }

  // Separate directed and free items
  let directedItems = expandedItems
    .filter(i => !!i.priority)
    .sort((a, b) => a.originalIndex - b.originalIndex);
  let freeItems = expandedItems
    .filter(i => !i.priority)
    .sort((a, b) => a.originalIndex - b.originalIndex);

  // Change 6: pre-assign multi-pilot items proportionally
  directedItems = assignMultiPilotItems(directedItems, pilots);
  freeItems = assignMultiPilotItems(freeItems, pilots);

  directionalStats.requested = directedItems.length;

  /** Attempt to place one expanded item. Returns true on success. */
  function processUnit(item: DemandItem, isDirectedCheck: boolean): boolean {
    const upPerUnit = item.upPerUnit;

    const preferredIdxList: number[] = (item.preferredPilotIds ?? [])
      .map((id) => pilots.findIndex((p) => p.id === id))
      .filter((idx) => idx >= 0);

    const validCandidates =
      preferredIdxList.length > 0 ? preferredIdxList : pilots.map((_, i) => i);

    if (validCandidates.length === 0) {
      unassignedItems.push({ demandId: item.id, client: item.client, type: item.type, quantity: 1, up: upPerUnit });
      return false;
    }

    // Sort preferred/valid pilots by current load ratio (reactive balancing)
    validCandidates.sort((a, b) => {
      const loadA = pilotAllocated[a] / (pilotCapacities[a] || 1);
      const loadB = pilotAllocated[b] / (pilotCapacities[b] || 1);
      return loadA - loadB;
    });

    let bestP = -1;
    let bestD = -1;

    let wStart = 0;
    let wEnd = numWorkdays - 1;

    if (isDirectedCheck && item.priority) {
      const bounds = getPriorityBounds(item.priority, numWorkdays);
      wStart = bounds[0];
      wEnd = bounds[1];
    }

    for (const p of validCandidates) {
      const minUP = pilots[p].minUP;
      const maxUP = pilots[p].maxUP;

      // 4-pass day selection (front-load: fill to minUP before starting next day)

      // Pass 1: Prefer under-min days + respect 3-client limit
      for (let d = wStart; d <= wEnd; d++) {
        if (schedules[p].days[d].totalUP >= minUP - TOLERANCE) continue;
        const room = maxUP - schedules[p].days[d].totalUP;
        if (room >= upPerUnit - TOLERANCE) {
          const cl = dailyClientsArray[p][d];
          if (cl.size < 3 || cl.has(item.client)) { bestP = p; bestD = d; break; }
        }
      }
      if (bestP !== -1) break;

      // Pass 2: Prefer under-min days, ignore 3-client limit (only when unavoidable)
      for (let d = wStart; d <= wEnd; d++) {
        if (schedules[p].days[d].totalUP >= minUP - TOLERANCE) continue;
        const room = maxUP - schedules[p].days[d].totalUP;
        if (room >= upPerUnit - TOLERANCE) { bestP = p; bestD = d; break; }
      }
      if (bestP !== -1) break;

      // Pass 3: Any day under maxUP + respect 3-client limit
      for (let d = wStart; d <= wEnd; d++) {
        const room = maxUP - schedules[p].days[d].totalUP;
        if (room >= upPerUnit - TOLERANCE) {
          const cl = dailyClientsArray[p][d];
          if (cl.size < 3 || cl.has(item.client)) { bestP = p; bestD = d; break; }
        }
      }
      if (bestP !== -1) break;

      // Pass 4: Any day under maxUP, ignore 3-client limit (last resort)
      for (let d = wStart; d <= wEnd; d++) {
        const room = maxUP - schedules[p].days[d].totalUP;
        if (room >= upPerUnit - TOLERANCE) { bestP = p; bestD = d; break; }
      }
      if (bestP !== -1) break;
    }

    if (bestP === -1 && isDirectedCheck) return false;

    if (bestP === -1) {
      unassignedItems.push({
        demandId: item.id, client: item.client, type: item.type, quantity: 1, up: upPerUnit,
        missedDirectional: item.priority ? true : undefined,
      });
      return false;
    }

    allocate(schedules, bestP, bestD, item, upPerUnit, pilotAllocated,
      item.priority ? !isDirectedCheck : false);
    dailyClientsArray[bestP][bestD].add(item.client);
    return true;
  }

  // Process directed items — Change 4: NO automatic overflow to later weeks.
  // If the item can't fit in its preferred week, the engineer must manually redirect it.
  for (const item of directedItems) {
    const succeeded = processUnit(item, true);
    if (succeeded) {
      directionalStats.obeyed++;
    } else {
      directionalStats.overflowed++;
      unassignedItems.push({
        demandId: item.id,
        client: item.client,
        type: item.type,
        quantity: 1,
        up: item.upPerUnit,
        missedDirectional: true,
      });
    }
  }

  // Process free items
  for (const item of freeItems) {
    processUnit(item, false);
  }

  // Change 5: Count empty days per pilot for actionable alerts
  const idlePilots = [];
  for (let i = 0; i < numPilots; i++) {
    if (pilotAllocated[i] < pilotCapacities[i] - TOLERANCE) {
      const emptyDays = schedules[i].days.filter(d => d.totalUP < TOLERANCE).length;
      idlePilots.push({
        name: pilots[i].name,
        planned: pilotAllocated[i],
        target: pilotCapacities[i],
        emptyDays,
      });
    }
  }

  const allocatedTotal = pilotAllocated.reduce((a, b) => a + b, 0);
  const diff = totalCapacityUP - totalDemandUP;
  const status: DistributionResult['status'] =
    Math.abs(diff) <= TOLERANCE ? 'balanced' : diff > 0 ? 'idle' : 'excess';

  return {
    schedules, totalDemandUP, totalCapacityUP,
    allocatedUP: allocatedTotal,
    coveragePercent: totalDemandUP > 0 ? (allocatedTotal / totalDemandUP) * 100 : 100,
    workdays, status, diffUP: Math.abs(diff),
    directionalStats, unassignedItems, idlePilots,
  };
}
