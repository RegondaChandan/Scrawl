import { useCallback } from 'react';
import { screenToWorld, type IconDef, type LibraryItem } from '@scrawl/engine';
import {
  getActivePage,
  instantiateLibraryItem,
  instantiateTemplateElements,
  type DiagramTemplate,
} from '@scrawl/editor';
import { createElement, maxOrder, type AnyElement } from '@scrawl/schema';
import { useEditor } from './use-editor';

function visibleCanvasCenter(): { x: number; y: number } {
  const topBarHeight = window.innerWidth <= 640 ? 52 : 58;
  return { x: window.innerWidth / 2, y: (window.innerHeight - topBarHeight) / 2 };
}

export function useLibraryInsertion(): {
  insertShape: (item: LibraryItem) => void;
  insertIcon: (icon: IconDef) => void;
  insertTemplate: (template: Pick<DiagramTemplate, 'elements'>, preserveStyle?: boolean) => void;
} {
  const document = useEditor((state) => state.document);
  const view = useEditor((state) => state.view);
  const actions = useEditor((state) => state.actions);

  const targetCenter = useCallback(() => {
    const screen = visibleCanvasCenter();
    return screenToWorld(view.camera, screen.x, screen.y);
  }, [view.camera]);

  const insertShape = useCallback(
    (item: LibraryItem): void => {
      const page = getActivePage(document);
      const element = instantiateLibraryItem(item, {
        center: targetCenter(),
        layerId: view.activeLayerId,
        order: maxOrder(page.elements) + 1,
        renderStyle: document.settings.mode,
        defaults: document.settings.defaults,
      });
      actions.addElement(element);
      actions.setOpenPanel(null);
    },
    [actions, document, targetCenter, view.activeLayerId],
  );

  const insertTemplate = useCallback(
    (template: Pick<DiagramTemplate, 'elements'>, preserveStyle = false): void => {
      const page = getActivePage(document);
      const elements: AnyElement[] = instantiateTemplateElements(template.elements, {
        center: targetCenter(),
        layerId: view.activeLayerId,
        startOrder: maxOrder(page.elements) + 1,
        ...(preserveStyle
          ? {}
          : {
              renderStyle: document.settings.mode,
              defaults: document.settings.defaults,
            }),
      });
      actions.insertElements(elements);
      actions.setOpenPanel(null);
    },
    [actions, document, targetCenter, view.activeLayerId],
  );

  const insertIcon = useCallback(
    (icon: IconDef): void => {
      const page = getActivePage(document);
      const center = targetCenter();
      actions.addElement(
        createElement('icon', {
          x: center.x - 42,
          y: center.y - 42,
          width: 84,
          height: 84,
          iconId: icon.id,
          layerId: view.activeLayerId,
          order: maxOrder(page.elements) + 1,
          renderStyle: document.settings.mode,
          ...document.settings.defaults,
        }),
      );
      actions.setOpenPanel(null);
    },
    [actions, document, targetCenter, view.activeLayerId],
  );

  return { insertShape, insertIcon, insertTemplate };
}
