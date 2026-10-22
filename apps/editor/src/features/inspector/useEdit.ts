import { formatPath, type ItemLocation, type Project } from '@travel-route-animator/core';
import { translateIssue } from '@/i18n/issues';
import { useEditor } from '@/state/editorStore';

/** Where an item sits in the project file, as validation paths spell it: groups[0].etappen[1] */
export function itemPath(location: ItemLocation): string {
  switch (location.kind) {
    case 'project':
      return '';
    case 'group':
      return formatPath(['groups', location.groupIndex]);
    case 'etappe':
      return formatPath(['groups', location.groupIndex, 'etappen', location.etappeIndex]);
    case 'track':
      return formatPath([
        'groups',
        location.groupIndex,
        'etappen',
        location.etappeIndex,
        'tracks',
        location.trackIndex,
      ]);
  }
}

function isWithin(issuePath: string, fieldPath: string): boolean {
  return (
    issuePath === fieldPath ||
    issuePath.startsWith(`${fieldPath}.`) ||
    issuePath.startsWith(`${fieldPath}[`)
  );
}

export interface EditOptions {
  /** Merge quick repeated changes of this field (typing, dragging in the colour picker) into one undo step. */
  coalesce?: boolean;
}

/**
 * The write path of every inspector field (ADR 0004): apply the change if the project stays
 * storable, otherwise return the German message for the field. `field` is the path below the
 * item, e.g. "durationSec" or "timing.startOffsetSec".
 */
export function useEdit(location: ItemLocation) {
  const applyIfValid = useEditor((state) => state.applyIfValid);
  const base = itemPath(location);

  return function edit(
    field: string,
    change: (project: Project) => Project,
    { coalesce = false }: EditOptions = {},
  ): string | null {
    const path = base ? `${base}.${field}` : field;
    const issues = applyIfValid(change, coalesce ? { coalesceKey: path } : {});
    // Normally the problem is in the field itself; if a change breaks a rule elsewhere, saying
    // so here still beats silently ignoring the input.
    const issue = issues.find((candidate) => isWithin(candidate.path, path)) ?? issues[0];
    return issue ? translateIssue(issue) : null;
  };
}
