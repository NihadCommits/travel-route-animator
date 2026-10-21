import type { Etappe } from '../model/etappe';
import { OutputSettingsSchema, type OutputSettings } from '../model/output';
import type { Id } from '../model/primitives';
import type { Group, Project } from '../model/project';
import type { MapStyleRef, TransitionSettings } from '../model/style';

// Settings are inherited top-down: stage → group → project default. The first level that sets
// a value wins as a whole (no field-by-field merging). This is the only place that resolves
// inheritance, so the editor and the renderer can never disagree about it.

export type SettingSource = 'etappe' | 'group' | 'project';

/** The effective value plus where it came from, so the UI can show "inherited from group". */
export interface Resolved<T> {
  value: T;
  from: SettingSource;
}

export function findEtappe(
  project: Project,
  etappeId: Id,
): { group: Group; etappe: Etappe } | undefined {
  for (const group of project.groups) {
    const etappe = group.etappen.find((candidate) => candidate.id === etappeId);
    if (etappe) return { group, etappe };
  }
  return undefined;
}

function requireEtappe(project: Project, etappeId: Id) {
  const found = findEtappe(project, etappeId);
  if (!found) throw new Error(`Stage "${etappeId}" does not exist in project "${project.name}"`);
  return found;
}

export function resolveMapStyle(project: Project, etappeId: Id): Resolved<MapStyleRef> {
  const { group, etappe } = requireEtappe(project, etappeId);
  if (etappe.mapStyle) return { value: etappe.mapStyle, from: 'etappe' };
  if (group.mapStyle) return { value: group.mapStyle, from: 'group' };
  return { value: project.defaults.mapStyle, from: 'project' };
}

/** Transition into the next stage. Stages have no own setting, so it comes from group or project. */
export function resolveTransition(project: Project, etappeId: Id): Resolved<TransitionSettings> {
  const { group } = requireEtappe(project, etappeId);
  if (group.transition) return { value: group.transition, from: 'group' };
  return { value: project.defaults.transition, from: 'project' };
}

/**
 * Project output settings with optional overrides from the render dialog. The combination is
 * validated again, so an override cannot sneak in e.g. a transparent H.264 export.
 */
export function resolveOutput(
  project: Project,
  override: Partial<OutputSettings> = {},
): OutputSettings {
  return OutputSettingsSchema.parse({ ...project.defaults.output, ...override });
}
