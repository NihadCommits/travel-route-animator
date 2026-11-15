import { z } from 'zod';
import { copyEtappe, type Added } from '../edit/operations';
import { locateItem, requireLocation } from '../edit/locate';
import { EtappeSchema, type Etappe } from '../model/etappe';
import { defaultFactoryContext, type FactoryContext } from '../model/factories';
import type { Id } from '../model/primitives';
import { CURRENT_SCHEMA_VERSION, GroupSchema, type Group, type Project } from '../model/project';

// Stages and groups as templates (M14), kept by the server outside every project, like own
// themes. A template holds the item as it is, minus what belongs to its project: own images
// (vehicle icons fall back to the catalog's, photo pins are left out).

export const TemplateIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, 'Template IDs may only use letters, digits, _ and -');

const base = {
  id: TemplateIdSchema,
  name: z.string().trim().min(1),
  createdAt: z.string(),
  /** The file format the item was saved in; another one is not read (no migrations yet). */
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
};

export const TemplateSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...base, kind: z.literal('etappe'), etappe: EtappeSchema }),
  z.strictObject({ ...base, kind: z.literal('group'), group: GroupSchema }),
]);
export type Template = z.infer<typeof TemplateSchema>;

/** The stage without its project's own images. */
function portable(etappe: Etappe): Etappe {
  return {
    ...etappe,
    tracks: etappe.tracks.map((track) =>
      track.style.icon.kind === 'image'
        ? { ...track, style: { ...track.style, icon: { kind: 'catalog' } } }
        : track,
    ),
    pins: etappe.pins.filter((pin) => pin.kind !== 'photo'),
  };
}

/** A stage or group of the project as a template. */
export function templateOf(
  project: Project,
  itemId: Id,
  {
    ctx = defaultFactoryContext,
    now = () => new Date(),
  }: { ctx?: FactoryContext; now?: () => Date } = {},
): Template {
  const location = locateItem(project, itemId);
  const meta = {
    id: ctx.createId('tpl'),
    createdAt: now().toISOString(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
  } as const;
  if (location?.kind === 'etappe') {
    const etappe = project.groups[location.groupIndex]!.etappen[location.etappeIndex]!;
    return { ...meta, name: etappe.name || 'Etappe', kind: 'etappe', etappe: portable(etappe) };
  }
  if (location?.kind === 'group') {
    const group = project.groups[location.groupIndex]!;
    return {
      ...meta,
      name: group.name || 'Gruppe',
      kind: 'group',
      group: { ...group, etappen: group.etappen.map(portable) },
    };
  }
  throw new Error('Only stages and groups can become templates');
}

/**
 * A copy of the template in the project, with fresh IDs: a stage at the end of `groupId`, a
 * group at the end of the project.
 */
export function insertTemplate(
  project: Project,
  template: Template,
  { groupId, ctx = defaultFactoryContext }: { groupId?: Id; ctx?: FactoryContext } = {},
): Added {
  if (template.kind === 'group') {
    const group: Group = {
      ...template.group,
      id: ctx.createId('g'),
      etappen: template.group.etappen.map((etappe) => copyEtappe(etappe, ctx)),
    };
    return { project: { ...project, groups: [...project.groups, group] }, id: group.id };
  }
  if (groupId === undefined) throw new Error('A stage template needs a group to go into');
  const { groupIndex } = requireLocation(project, groupId, 'group');
  const etappe = copyEtappe(template.etappe, ctx);
  return {
    project: {
      ...project,
      groups: project.groups.map((group, i) =>
        i === groupIndex ? { ...group, etappen: [...group.etappen, etappe] } : group,
      ),
    },
    id: etappe.id,
  };
}
