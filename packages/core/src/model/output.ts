import { z } from 'zod';
import { reportIssue } from './issues';
import { IdSchema } from './primitives';

export const AspectSchema = z.enum(['16:9', '9:16', '1:1', '4:5']);
export const ResolutionSchema = z.enum(['720p', '1080p', '1440p', '2160p']);
export const FpsSchema = z.literal([24, 25, 30, 50, 60]);

export const OutputSettingsSchema = z
  .strictObject({
    aspect: AspectSchema,
    resolution: ResolutionSchema,
    fps: FpsSchema,
    codec: z.enum(['h264', 'prores-422hq', 'prores-4444']),
    /** Hides the map and keeps only routes, vehicles and labels. Needs an alpha channel. */
    transparentOverlay: z.boolean(),
    /** Guides in the preview only, never in the export. */
    safeAreaGuides: z.boolean(),
  })
  .superRefine((output, ctx) => {
    if (output.transparentOverlay && output.codec !== 'prores-4444') {
      reportIssue(ctx, {
        path: ['transparentOverlay'],
        input: output.transparentOverlay,
        code: 'output.transparentNeedsProres',
        message: `A transparent overlay needs the prores-4444 codec (alpha channel), not ${output.codec}`,
        values: { codec: output.codec },
      });
    }
  });
export type OutputSettings = z.infer<typeof OutputSettingsSchema>;

const ChainModeSchema = z.enum(['chained', 'separate']);

export const RenderTargetSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('etappe'), etappeId: IdSchema }),
  z.strictObject({ kind: z.literal('group'), groupId: IdSchema, mode: ChainModeSchema }),
  z.strictObject({
    kind: z.literal('selection'),
    etappeIds: z.array(IdSchema).min(1),
    mode: ChainModeSchema,
  }),
]);
export type RenderTarget = z.infer<typeof RenderTargetSchema>;
