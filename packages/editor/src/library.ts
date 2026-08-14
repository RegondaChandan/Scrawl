import type { LibraryItem } from '@scrawl/engine';
import {
  createElement,
  type AnyElement,
  type ElementDefaults,
  type Point,
  type StyleMode,
} from '@scrawl/schema';

export interface LibraryItemPlacement {
  center: Point;
  layerId: string;
  order: number;
  renderStyle: StyleMode;
  defaults: ElementDefaults;
}

export function instantiateLibraryItem(
  item: LibraryItem,
  placement: LibraryItemPlacement,
): AnyElement {
  return createElement(item.type, {
    x: placement.center.x - item.width / 2,
    y: placement.center.y - item.height / 2,
    width: item.width,
    height: item.height,
    layerId: placement.layerId,
    order: placement.order,
    renderStyle: placement.renderStyle,
    ...placement.defaults,
    ...(item.shapeKind ? { shapeKind: item.shapeKind } : {}),
  });
}
