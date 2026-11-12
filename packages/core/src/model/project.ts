import { z } from 'zod';
import { AssetSchema } from './assets';
import { EtappeSchema } from './etappe';
import { reportIssue } from './issues';
import { OutputSettingsSchema } from './output';
import { HexColorSchema, IdSchema, IsoDateTimeSchema } from './primitives';
import { MapStyleRefSchema, TransitionSettingsSchema } from './style';

/** Bump together with a new migration in migrations/migrations.ts. */
export const CURRENT_SCHEMA_VERSION = 4;

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
    /** Files in the project's folder, such as images for vehicles (ADR 0009). */
    assets: z.array(AssetSchema),
  })
  .superRefine((project, ctx) => {
    // IDs must be unique across the whole project, not just among siblings: the editor selects,
    // moves and references items by ID alone (e.g. a stage dragged into another group).
    const firstSeenAt = new Map<string, (string | number)[]>();
    const check = (id: string, path: (string | number)[]) => {
      const earlier = firstSeenAt.get(id);
      if (earlier) {
        const firstPath = formatPath([...earlier, 'id']);
        reportIssue(ctx, {
          path: [...path, 'id'],
          input: id,
          code: 'project.duplicateId',
          message: `ID "${id}" is already used at ${firstPath}`,
          values: { id, firstPath },
        });
      } else {
        firstSeenAt.set(id, path);
      }
    };

    check(project.id, []);
    const assetIds = new Set(project.assets.map((asset) => asset.id));
    project.groups.forEach((group, g) => {
      check(group.id, ['groups', g]);
      group.etappen.forEach((etappe, e) => {
        check(etappe.id, ['groups', g, 'etappen', e]);
        etappe.tracks.forEach((track, t) => {
          check(track.id, ['groups', g, 'etappen', e, 'tracks', t]);
          const { icon } = track.style;
          if (icon.kind === 'image' && !assetIds.has(icon.assetId)) {
            reportIssue(ctx, {
              path: ['groups', g, 'etappen', e, 'tracks', t, 'style', 'icon', 'assetId'],
              input: icon.assetId,
              code: 'track.iconAssetMissing',
              message: `The icon's image "${icon.assetId}" is not among the project's assets`,
              values: { assetId: icon.assetId },
            });
          }
          track.waypoints.forEach((waypoint, w) => {
            check(waypoint.id, ['groups', g, 'etappen', e, 'tracks', t, 'waypoints', w]);
          });
        });
      });
    });
    // Last, as they are listed last in the file: a clash is reported at the asset.
    project.assets.forEach((asset, a) => check(asset.id, ['assets', a]));
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
