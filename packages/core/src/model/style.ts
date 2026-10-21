import { z } from 'zod';
import { MapBaseSchema } from './enums';
import { HexColorSchema } from './primitives';

/** Colour slots of a vector theme. Expanded in M9. */
export const ThemeTokensSchema = z.strictObject({
  background: HexColorSchema,
  land: HexColorSchema,
  water: HexColorSchema,
  park: HexColorSchema,
  roadMajor: HexColorSchema,
  roadMinor: HexColorSchema,
  building: HexColorSchema,
  boundary: HexColorSchema,
  labelText: HexColorSchema,
  labelHalo: HexColorSchema,
});
export type ThemeTokens = z.infer<typeof ThemeTokensSchema>;

const THEMED_BASES = new Set(['vector', 'terrain']);

export const MapStyleRefSchema = z
  .strictObject({
    base: MapBaseSchema,
    /** Built-in or custom theme; only meaningful for vector and terrain maps. */
    themeId: z.string().min(1).optional(),
    overrides: ThemeTokensSchema.partial().optional(),
  })
  .superRefine((style, ctx) => {
    if (THEMED_BASES.has(style.base)) return;
    for (const key of ['themeId', 'overrides'] as const) {
      if (style[key] !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          input: style[key],
          message: `${key} only applies to vector and terrain maps, not to "${style.base}"`,
        });
      }
    }
  });
export type MapStyleRef = z.infer<typeof MapStyleRefSchema>;

export const TransitionSettingsSchema = z.strictObject({
  type: z.enum(['cut', 'camera-fly', 'fade']),
  durationSec: z.number().min(0),
});
export type TransitionSettings = z.infer<typeof TransitionSettingsSchema>;
