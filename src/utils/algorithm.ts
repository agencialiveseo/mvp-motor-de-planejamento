import type { DemandItem, Pilot, PilotSchedule, DistributionResult, AllocationItem, Priority } from '../types';
import { UP_CONSTANTS } from '../constants/productions';
import { getWorkdays } from './dates';

const TOLERANCE = 0.05;

/**
 * Returns the valid day index bounds [startDay, endDay] for a given priority level.
 *  alta  → first two calendar weeks (workdays 0–9)
 *  baixa → remainder of the month (workdays 10+) [used internally for Round 2 fallback]
 */
function getPriorityBounds(priority: Priority | 'baixa', numWorkdays: number): [number, number] {
  const maxD = numWorkdays - 1;
  switch (priority) {
    case 'alta':  return [0, Math.min(9, maxD)];
    case 'baixa': return [Math.min(10, maxD), maxD];
    default:      return [0, maxD];
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
    note: item.note || undefined,
  };
  schedules[pilotIdx].days[dayIdx].items.push(alloc);
  schedules[pilotIdx].days[dayIdx].totalUP += up;
  pilotAllocated[pilotIdx] += up;
}

/**
 * Pre-assigns items that have MULTIPLE preferred pilots to a single pilot each,
 * distributing proportionally based on each pilot's targetUP.
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
    const totalTarget = pilotIndices.reduce((s, i) => s + pilots[i].targetUP, 0);

    itemIndices.forEach(idx => {
      const item = items[idx];
      const totalAssigned = count.reduce((s, a) => s + a, 0) || 1e-10;

      let bestJ = 0;
      let bestDebt = -Infinity;
      for (let j = 0; j < pilotIndices.length; j++) {
        const proportion = pilots[pilotIndices[j]].targetUP / totalTarget;
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
 * Distributes unitized demand items across pilots (V7 Algorithm)
 *
 * Changes vs V6:
 *  - Mudança 1: allHigh check → if 100% of items are 'alta', treat all as 'livre'
 *  - Mudança 2: use pilot.maxUP as daily ceiling (replaces targetUP + MAX_DAILY_OVERAGE)
 *  - Mudança 7: Round 3 fallback — Alta items that didn't fit in weeks 1-2 displace
 *               Baixa items from weeks 3-4 (marked displacedByHighPriority: true)
 *
 * Round order:
 *  Round 1 — Alta in window (days 0–9)
 *  Round 2 — Free/Livre items fill remaining space
 *  Round 3 — Alta fallback (altaOverflow → days 10+, displacing items if needed)
 *  [Round 4] — not needed since free items come before round 3 for simplicity
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

  const pilotCapacities = pilots.map((p) => p.targetUP * numWorkdays);
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

  // Separate directed (alta) and free items
  let directedItems = expandedItems
    .filter(i => i.priority === 'alta')
    .sort((a, b) => a.originalIndex - b.originalIndex);
  let freeItems = expandedItems
    .filter(i => !i.priority)
    .sort((a, b) => a.originalIndex - b.originalIndex);

  // Mudança 1: if ALL items from this engineer are 'alta', treat them all as 'livre'
  const allItemsAreAlta =
    expandedItems.length > 0 && expandedItems.every(item => item.priority === 'alta');
  if (allItemsAreAlta) {
    freeItems = [...directedItems, ...freeItems].sort((a, b) => a.originalIndex - b.originalIndex);
    directedItems = [];
  }

  // Pre-assign multi-pilot items proportionally
  directedItems = assignMultiPilotItems(directedItems, pilots);
  freeItems = assignMultiPilotItems(freeItems, pilots);

  directionalStats.requested = directedItems.length;

  /**
   * Attempt to place one expanded item in the given day range.
   * Returns true on success.
   */
  function processUnit(
    item: DemandItem,
    wStart: number,
    wEnd: number,
    isDirectedCheck: boolean
  ): boolean {
    const upPerUnit = item.upPerUnit;

    const preferredIdxList: number[] = (item.preferredPilotIds ?? [])
      .map((id) => pilots.findIndex((p) => p.id === id))
      .filter((idx) => idx >= 0);

    const validCandidates =
      preferredIdxList.length > 0 ? preferredIdxList : pilots.map((_, i) => i);

    if (validCandidates.length === 0) {
      unassignedItems.push({ demandId: item.id, client: item.client, type: item.type, quantity: 1, up: upPerUnit, note: item.note || undefined });
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

    for (const p of validCandidates) {
      // Mudança 2: use pilot.maxUP as daily ceiling
      const dailyCap = pilots[p].maxUP;
      const targetUP = pilots[p].targetUP;

      // Pass 1: under-target days + respect 3-client limit
      for (let d = wStart; d <= wEnd; d++) {
        if (schedules[p].days[d].totalUP >= targetUP - TOLERANCE) continue;
        const room = dailyCap - schedules[p].days[d].totalUP;
        if (room >= upPerUnit - TOLERANCE) {
          const cl = dailyClientsArray[p][d];
          if (cl.size < 3 || cl.has(item.client)) { bestP = p; bestD = d; break; }
        }
      }
      if (bestP !== -1) break;

      // Pass 2: under-target days, ignore 3-client limit
      for (let d = wStart; d <= wEnd; d++) {
        if (schedules[p].days[d].totalUP >= targetUP - TOLERANCE) continue;
        const room = dailyCap - schedules[p].days[d].totalUP;
        if (room >= upPerUnit - TOLERANCE) { bestP = p; bestD = d; break; }
      }
      if (bestP !== -1) break;

      // Pass 3: any day under dailyCap + respect 3-client limit
      for (let d = wStart; d <= wEnd; d++) {
        const room = dailyCap - schedules[p].days[d].totalUP;
        if (room >= upPerUnit - TOLERANCE) {
          const cl = dailyClientsArray[p][d];
          if (cl.size < 3 || cl.has(item.client)) { bestP = p; bestD = d; break; }
        }
      }
      if (bestP !== -1) break;

      // Pass 4: any day under dailyCap, ignore 3-client limit (last resort)
      for (let d = wStart; d <= wEnd; d++) {
        const room = dailyCap - schedules[p].days[d].totalUP;
        if (room >= upPerUnit - TOLERANCE) { bestP = p; bestD = d; break; }
      }
      if (bestP !== -1) break;
    }

    if (bestP === -1 && isDirectedCheck) return false;

    if (bestP === -1) {
      unassignedItems.push({
        demandId: item.id, client: item.client, type: item.type, quantity: 1, up: upPerUnit,
        missedDirectional: item.priority ? true : undefined,
        note: item.note || undefined,
      });
      return false;
    }

    allocate(schedules, bestP, bestD, item, upPerUnit, pilotAllocated,
      item.priority ? !isDirectedCheck : false);
    dailyClientsArray[bestP][bestD].add(item.client);
    return true;
  }

  // ── Round 1: Alta in window (days 0–9) ───────────────────────────────────
  const altaOverflow: DemandItem[] = [];
  const altaBounds = getPriorityBounds('alta', numWorkdays);

  for (const item of directedItems) {
    const succeeded = processUnit(item, altaBounds[0], altaBounds[1], true);
    if (succeeded) {
      directionalStats.obeyed++;
    } else {
      directionalStats.overflowed++;
      altaOverflow.push(item); // will be tried in Round 3
    }
  }

  // ── Round 2: Free items fill all available slots ──────────────────────────
  const freeBounds: [number, number] = [0, numWorkdays - 1];
  for (const item of freeItems) {
    processUnit(item, freeBounds[0], freeBounds[1], false);
  }

  // ── Round 3 (Mudança 7): Alta fallback — try days 10+ ────────────────────
  if (altaOverflow.length > 0) {
    const fallbackStart = getPriorityBounds('baixa', numWorkdays)[0];
    const fallbackEnd = numWorkdays - 1;

    for (const altaItem of altaOverflow) {
      const upPerUnit = altaItem.upPerUnit;

      const preferredIdxList: number[] = (altaItem.preferredPilotIds ?? [])
        .map((id) => pilots.findIndex((p) => p.id === id))
        .filter((idx) => idx >= 0);
      const candidates =
        preferredIdxList.length > 0 ? preferredIdxList : pilots.map((_, i) => i);

      let placed = false;

      for (const p of candidates) {
        if (placed) break;
        const dailyCap = pilots[p].maxUP;

        for (let d = fallbackStart; d <= fallbackEnd; d++) {
          const day = schedules[p].days[d];
          const room = dailyCap - day.totalUP;

          if (room >= upPerUnit - TOLERANCE) {
            // Slot has room — place directly
            allocate(schedules, p, d, altaItem, upPerUnit, pilotAllocated, false);
            dailyClientsArray[p][d].add(altaItem.client);
            placed = true;
            break;
          }

          // No room — try to displace a free/livre item to make space
          const displaceIdx = day.items.findIndex(
            it => !it.priority && !it.displacedByHighPriority
          );
          if (displaceIdx !== -1) {
            const displaced = day.items[displaceIdx];
            // Remove displaced item from day
            day.items.splice(displaceIdx, 1);
            day.totalUP -= displaced.up;
            pilotAllocated[p] -= displaced.up;

            // Mark as displaced and move to unassigned
            unassignedItems.push({ ...displaced, displacedByHighPriority: true });

            // Place alta item in freed slot
            allocate(schedules, p, d, altaItem, upPerUnit, pilotAllocated, false);
            dailyClientsArray[p][d].add(altaItem.client);
            placed = true;
            break;
          }
        }
      }

      if (!placed) {
        // Still couldn't place — add to unassigned
        unassignedItems.push({
          demandId: altaItem.id,
          client: altaItem.client,
          type: altaItem.type,
          quantity: 1,
          up: upPerUnit,
          missedDirectional: true,
          note: altaItem.note || undefined,
        });
      }
    }
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
