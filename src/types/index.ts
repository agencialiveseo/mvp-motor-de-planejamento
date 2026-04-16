export type ProductionType =
  | 'blogpost_produce'
  | 'category_produce'
  | 'product_description_produce'
  | 'serp_produce'
  | 'blogpost_plan'
  | 'category_plan'
  | 'product_description_plan';

export type Priority = 'alta';

export const PRIORITY_LABELS: Record<Priority, string> = {
  alta: 'Alta',
};

export const PRIORITY_OPTIONS = Object.keys(PRIORITY_LABELS) as Priority[];


export interface DemandItem {
  id: string;
  client: string;
  type: ProductionType;
  quantity: number;
  remainingQty: number;
  upPerUnit: number;
  originalIndex: number;
  /** Up to 4 preferred pilot IDs; empty/absent = any pilot */
  preferredPilotIds?: string[];
  priority?: Priority | null;
}

export interface Pilot {
  id: string;
  name: string;
  minUP: number;
  maxUP: number;
  tarefas?: number;
  ajustePost?: number;
  ajusteCat?: number;
  ajusteSerp?: number;
}

export interface AllocationItem {
  demandId: string;
  client: string;
  type: ProductionType;
  quantity: number;
  up: number;
  /** True when this item was redirected to a pilot that was NOT in preferredPilotIds */
  isSpillover?: boolean;
  priority?: Priority | null;
  missedDirectional?: boolean;
}

export interface DayAllocation {
  date: Date;
  items: AllocationItem[];
  totalUP: number;
}

export interface PilotSchedule {
  pilot: Pilot;
  days: DayAllocation[];
}

/** Warning when overflow from preferred pilot(s) occurs */
export interface SpilloverWarning {
  client: string;
  type: ProductionType;
  spilledCount: number;
  /** Names of all preferred pilots for this demand item */
  preferredPilotNames: string[];
  toPilotName: string;
}

export interface DistributionResult {
  schedules: PilotSchedule[];
  totalDemandUP: number;
  totalCapacityUP: number;
  allocatedUP: number;
  coveragePercent: number;
  workdays: Date[];
  status: 'balanced' | 'excess' | 'idle';
  diffUP: number;
  unassignedItems: AllocationItem[];
  idlePilots: { name: string; planned: number; target: number; emptyDays: number }[];
  directionalStats: {
    requested: number;
    obeyed: number;
    overflowed: number;
  };
}
