import type { AnyElement } from './elements';

export function normalizeOrder(elements: AnyElement[]): AnyElement[] {
  const orders = new Set<number>();
  const valid = elements.every((element) => {
    if (!Number.isFinite(element.order) || orders.has(element.order)) return false;
    orders.add(element.order);
    return true;
  });

  if (!valid) return elements.map((element, index) => ({ ...element, order: index + 1 }));
  return [...elements].sort((left, right) => left.order - right.order);
}

export function maxOrder(elements: AnyElement[]): number {
  return elements.reduce((maximum, element) => Math.max(maximum, element.order), 0);
}

export function minOrder(elements: AnyElement[]): number {
  return elements.reduce((minimum, element) => Math.min(minimum, element.order), 0);
}
