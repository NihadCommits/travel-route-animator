import { editEtappe, type Added } from '../edit/operations';
import { defaultFactoryContext, type FactoryContext } from '../model/factories';
import type { Anchor, Widget, WidgetKind } from '../model/overlays';
import type { Project } from '../model/project';
import type { Id } from '../model/primitives';
import { findEtappe } from '../resolve/resolve';

// Adding, changing and removing overlay blocks (M17). A block lives in one stage; its ID is
// unique in the project, so the preview can find it by the ID it draws on the block.

/** Distance from the edges for a new block, and the step between blocks stacked on a side. */
const MARGIN = 48;
const BOTTOM = 44;
const STACK_STEP = 92;

/** Kinds that go to the top: names and dates read like a heading; the rest counts at the bottom. */
const TOP_KINDS: readonly WidgetKind[] = ['text', 'place', 'date', 'flag'];

/** Where a new block of this kind goes: on its side, above or below the blocks already there. */
export function placeForNewWidget(
  widgets: readonly Widget[],
  kind: WidgetKind,
): Pick<Widget, 'anchor' | 'dx' | 'dy'> {
  const anchor: Anchor = TOP_KINDS.includes(kind) ? 'top-left' : 'bottom-left';
  const taken = widgets.filter((widget) => widget.anchor === anchor && widget.dx === MARGIN);
  // The first 44 px from the edge, as the counters always stood; the next one a step further in.
  const dy =
    taken.length === 0 ? BOTTOM : Math.max(...taken.map((widget) => widget.dy)) + STACK_STEP;
  return { anchor, dx: MARGIN, dy };
}

/** A new block in a stage, at the next free place on its side. */
export function addWidget(
  project: Project,
  etappeId: Id,
  kind: WidgetKind,
  ctx: FactoryContext = defaultFactoryContext,
): Added {
  const etappe = findEtappe(project, etappeId)?.etappe;
  if (!etappe) throw new Error(`Stage "${etappeId}" does not exist`);
  const widget: Widget = {
    id: ctx.createId('w'),
    kind,
    ...placeForNewWidget(etappe.overlays.widgets, kind),
    scale: 1,
    transition: 'none',
    ...(kind === 'text' && { text: 'Text' }),
  };
  const next = editEtappe(project, etappeId, (e) => ({
    ...e,
    overlays: { ...e.overlays, widgets: [...e.overlays.widgets, widget] },
  }));
  return { project: next, id: widget.id };
}

/** The stage that holds a block, if any. */
export function etappeOfWidget(project: Project, widgetId: Id): Id | undefined {
  for (const group of project.groups) {
    for (const etappe of group.etappen) {
      if (etappe.overlays.widgets.some((widget) => widget.id === widgetId)) return etappe.id;
    }
  }
  return undefined;
}

/** Changes one block wherever it is; a project without it comes back unchanged. */
export function editWidget(
  project: Project,
  widgetId: Id,
  update: (widget: Widget) => Widget,
): Project {
  const etappeId = etappeOfWidget(project, widgetId);
  if (!etappeId) return project;
  return editEtappe(project, etappeId, (e) => ({
    ...e,
    overlays: {
      ...e.overlays,
      widgets: e.overlays.widgets.map((widget) =>
        widget.id === widgetId ? update(widget) : widget,
      ),
    },
  }));
}

export function removeWidget(project: Project, widgetId: Id): Project {
  const etappeId = etappeOfWidget(project, widgetId);
  if (!etappeId) return project;
  return editEtappe(project, etappeId, (e) => ({
    ...e,
    overlays: { ...e.overlays, widgets: e.overlays.widgets.filter((w) => w.id !== widgetId) },
  }));
}

/**
 * The offsets after dragging a block by (deltaX, deltaY) reference pixels on screen: towards an
 * edge's inside when it is anchored there, plainly when it is in the middle.
 */
export function movedOffsets(
  widget: Pick<Widget, 'anchor' | 'dx' | 'dy'>,
  deltaX: number,
  deltaY: number,
): Pick<Widget, 'dx' | 'dy'> {
  const signX = widget.anchor.endsWith('right') ? -1 : 1;
  const signY = widget.anchor.startsWith('bottom') ? -1 : 1;
  return {
    dx: Math.round(widget.dx + signX * deltaX),
    dy: Math.round(widget.dy + signY * deltaY),
  };
}
