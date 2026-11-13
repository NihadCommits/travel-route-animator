import { z } from 'zod';
import { reportIssue } from './issues';
import { IdSchema } from './primitives';

export const AspectSchema = z.enum(['16:9', '9:16', '1:1', '4:5']);
export const ResolutionSchema = z.enum(['720p', '1080p', '1440p', '2160p']);
export const FpsSchema = z.literal([24, 25, 30, 50, 60]);

/**
 * What a render writes (ADR 0013): H.264 in MP4 for most uses, ProRes in MOV for editing,
 * and a folder of PNGs, one per frame. ProRes 4444 and PNG keep an alpha channel.
 */
export const CODECS = ['h264', 'prores-422hq', 'prores-4444', 'png-sequence'] as const;
export const CodecSchema = z.enum(CODECS);
export type Codec = z.infer<typeof CodecSchema>;

/** Whether the codec keeps an alpha channel, which a transparent overlay needs. */
export function codecHasAlpha(codec: Codec): boolean {
  return codec === 'prores-4444' || codec === 'png-sequence';
}

/** The file extension a render gets; empty for a PNG sequence, which is a folder. */
export function outputExtensionOf(codec: Codec): '.mp4' | '.mov' | '' {
  if (codec === 'h264') return '.mp4';
  return codec === 'png-sequence' ? '' : '.mov';
}

export const OutputSettingsSchema = z
  .strictObject({
    aspect: AspectSchema,
    resolution: ResolutionSchema,
    fps: FpsSchema,
    codec: CodecSchema,
    /** Hides the map and keeps only routes, vehicles and labels. Needs an alpha channel. */
    transparentOverlay: z.boolean(),
    /** Guides in the preview only, never in the export. */
    safeAreaGuides: z.boolean(),
  })
  .superRefine((output, ctx) => {
    if (output.transparentOverlay && !codecHasAlpha(output.codec)) {
      reportIssue(ctx, {
        path: ['transparentOverlay'],
        input: output.transparentOverlay,
        code: 'output.transparentNeedsProres',
        message: `A transparent overlay needs an alpha channel (prores-4444 or png-sequence), not ${output.codec}`,
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
