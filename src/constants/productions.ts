import type { ProductionType } from '../types';

/**
 * Constante divisora para cada tipo de produção.
 * UP = quantidade / constante
 */
export const UP_CONSTANTS: Record<ProductionType, number> = {
  blogpost_produce: 1.5,
  category_produce: 1.67,
  product_description_produce: 1.79,
  serp_produce: 135.0,
  blogpost_plan: 5.73,
  category_plan: 9.28,
  product_description_plan: 9.28,
};

export const PRODUCTION_LABELS: Record<ProductionType, string> = {
  blogpost_produce: 'Produzir blogpost',
  category_produce: 'Produzir categoria',
  product_description_produce: 'Produzir descrição de produto',
  serp_produce: 'Produzir SERP',
  blogpost_plan: 'Planejar blogpost',
  category_plan: 'Planejar categoria',
  product_description_plan: 'Planejar descrição de produto',
};

export const PRODUCTION_TYPES = Object.keys(UP_CONSTANTS) as ProductionType[];

export function calcUP(type: ProductionType, quantity: number): number {
  return quantity / UP_CONSTANTS[type];
}
