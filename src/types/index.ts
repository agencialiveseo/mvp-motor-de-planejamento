export type ProductionType =
  | 'blogpost_produce'
  | 'category_produce'
  | 'product_description_produce'
  | 'serp_produce'
  | 'blogpost_plan'
  | 'category_plan'
  | 'product_description_plan';

export type PreferredWeek = 'semana_1' | 'semana_2' | 'semana_3' | 'semana_4' | 'ultima_semana';

export const WEEK_LABELS: Record<PreferredWeek, string> = {
  semana_1: 'Semana 1',
  semana_2: 'Semana 2',
  semana_3: 'Semana 3',
  semana_4: 'Semana 4',
  ultima_semana: 'Última semana (5 últimos dias)',
};

export const WEEK_OPTIONS = Object.keys(WEEK_LABELS) as PreferredWeek[];


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
  preferredWeek?: PreferredWeek | null;
}

export interface Pilot {
  id: string;
  name: string;
  /** Item 2: individual daily target (min 4) */
  targetUP: number;
}

export interface AllocationItem {
  demandId: string;
  client: string;
  type: ProductionType;
  quantity: number;
  up: number;
  /** True when this item was redirected to a pilot that was NOT in preferredPilotIds */
  isSpillover?: boolean;
  preferredWeek?: PreferredWeek | null;
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
