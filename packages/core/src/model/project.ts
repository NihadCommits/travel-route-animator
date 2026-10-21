import { z } from 'zod';
import { EtappeSchema } from './etappe';
import { OutputSettingsSchema } from './output';
import { HexColorSchema, IdSchema, IsoDateTimeSchema } from './primitives';
import { MapStyleRefSchema, TransitionSettingsSchema } from './style';

/** Bump together with a new migration in migrations/index.ts. */
export const CURRENT_SCHEMA_VERSION = 1;

export const ProjectDefaultsSchema = z.strictObject({
  /** Default look, overridable per group and stage. */
  mapStyle: MapStyleRefSchema,
  output: OutputSettingsSchema,
  /** Default transition between chained stages, overridable per group. */
  transition: TransitionSettingsSchema,
});
export type ProjectDefaults = z.infer<typeof ProjectDefaultsSchema>;

export const GroupSchema = z.strictObject({
  id: IdSchema,
  name: z.string(),
  /** Marker colour in the project tree. */
  color: HexColorSchema.optional(),
  mapStyle: MapStyleRefSchema.optional(),
  transition: TransitionSettingsSchema.optional(),
  etappen: z.array(EtappeSchema),
});
export type Group = z.infer<typeof GroupSchema>;

export const ProjectSchema = z
  .strictObject({
    schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
    id: IdSchema,
    name: z.string().trim().min(1, 'A project needs a name'),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
    defaults: ProjectDefaultsSchema,
    groups: z.array(GroupSchema),
  })
  .superRefine((project, ctx) => {
    // IDs must be unique across the whole project, not just among siblings: the editor selects,
    // moves and references items by ID alone (e.g. a stage dragged into another group).
    const firstSeenAt = new Map<string, (string | number)[]>();
    const check = (id: string, path: (string | number)[]) => {
      const earlier = firstSeenAt.get(id);
      if (earlier) {
        ctx.addIssue({
          code: 'custom',
          path: [...path, 'id'],
          input: id,
          message: `ID "${id}" is already used at ${formatPath([...earlier, 'id'])}`,
        });
      } else {
        firstSeenAt.set(id, path);
      }
    };

    check(project.id, []);
    project.groups.forEach((group, g) => {
      check(group.id, ['groups', g]);
      group.etappen.forEach((etappe, e) => {
        check(etappe.id, ['groups', g, 'etappen', e]);
        etappe.tracks.forEach((track, t) => {
          check(track.id, ['groups', g, 'etappen', e, 'tracks', t]);
          track.waypoints.forEach((waypoint, w) => {
            check(waypoint.id, ['groups', g, 'etappen', e, 'tracks', t, 'waypoints', w]);
          });
        });
      });
    });
  });
export type Project = z.infer<typeof ProjectSchema>;

/** Renders a Zod path the way you would write it in code: groups[0].etappen[1].name */
export function formatPath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((text, key) => {
    if (typeof key === 'number') return `${text}[${key}]`;
    const name = String(key);
    return text === '' ? name : `${text}.${name}`;
  }, '');
}
