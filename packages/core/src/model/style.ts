import { z } from 'zod';
import { MapBaseSchema } from './enums';
import { reportIssue } from './issues';
import { HexColorSchema } from './primitives';

// Map looks (ADR 0010). A theme is data: colours, which layers show, which kinds of labels
// show, and a few extras. packages/styles turns it into a MapLibre style.

/** Colour slots of a vector theme. */
export const ThemeTokensSchema = z.strictObject({
  /** Around the picture and behind the globe. */
  background: HexColorSchema,
  land: HexColorSchema,
  /** Woods, grass and other natural cover. */
  landcover: HexColorSchema,
  park: HexColorSchema,
  ice: HexColorSchema,
  /** Built-up areas. */
  urban: HexColorSchema,
  water: HexColorSchema,
  waterText: HexColorSchema,
  roadMotorway: HexColorSchema,
  roadMajor: HexColorSchema,
  roadMinor: HexColorSchema,
  roadCasing: HexColorSchema,
  rail: HexColorSchema,
  building: HexColorSchema,
  boundary: HexColorSchema,
  labelText: HexColorSchema,
  labelHalo: HexColorSchema,
});
export type ThemeTokens = z.infer<typeof ThemeTokensSchema>;

/** Kinds of map labels that can be switched on and off one by one. */
export const LabelKindSchema = z.enum([
  'countries',
  'states',
  'cities',
  'towns',
  'villages',
  'roads',
  'water',
  'pois',
]);
export type LabelKind = z.infer<typeof LabelKindSchema>;

export const LabelSettingsSchema = z.strictObject({
  countries: z.boolean(),
  states: z.boolean(),
  cities: z.boolean(),
  towns: z.boolean(),
  villages: z.boolean(),
  roads: z.boolean(),
  water: z.boolean(),
  pois: z.boolean(),
});
export type LabelSettings = z.infer<typeof LabelSettingsSchema>;

/** Which spelling place names take: the country's own (Lisboa), German (Lissabon) or English. */
export const LabelLanguageSchema = z.enum(['local', 'de', 'en']);
export type LabelLanguage = z.infer<typeof LabelLanguageSchema>;

/** Layers a theme shows or leaves out. */
export const ThemeLayersSchema = z.strictObject({
  minorRoads: z.boolean(),
  buildings: z.boolean(),
  boundaries: z.boolean(),
  landcover: z.boolean(),
  /** Shaded relief from Natural Earth at low zoom. */
  relief: z.boolean(),
});
export type ThemeLayers = z.infer<typeof ThemeLayersSchema>;

/** Looks drawn over the map as HTML, the same in preview and export. */
export const ThemeExtrasSchema = z.strictObject({
  texture: z.enum(['none', 'paper']),
  /** Darker corners, 0 (none) to 1. */
  vignette: z.number().min(0).max(1),
});
export type ThemeExtras = z.infer<typeof ThemeExtrasSchema>;

/** Theme IDs name files of own themes (data/themes/<id>.json), hence the narrow alphabet. */
export const ThemeIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, 'Theme IDs may only use letters, digits, _ and -');

export const ThemeSchema = z.strictObject({
  id: ThemeIdSchema,
  name: z.string().trim().min(1, 'A theme needs a name').max(100),
  tokens: ThemeTokensSchema,
  layers: ThemeLayersSchema,
  labels: LabelSettingsSchema,
  extras: ThemeExtrasSchema,
});
export type Theme = z.infer<typeof ThemeSchema>;

const THEMED_BASES = new Set(['vector', 'terrain']);

export const MapStyleRefSchema = z
  .strictObject({
    base: MapBaseSchema,
    /** Built-in or own theme; only meaningful for vector and terrain maps. */
    themeId: ThemeIdSchema.optional(),
    overrides: ThemeTokensSchema.partial().optional(),
    /** Label kinds that differ from the theme; all false is "Saubere Karte" (ADR 0010). */
    labels: LabelSettingsSchema.partial().optional(),
    /** Missing is the country's own language. */
    language: LabelLanguageSchema.optional(),
  })
  .superRefine((style, ctx) => {
    if (THEMED_BASES.has(style.base)) return;
    for (const key of ['themeId', 'overrides'] as const) {
      if (style[key] !== undefined) {
        reportIssue(ctx, {
          path: [key],
          input: style[key],
          code: 'style.onlyThemedBases',
          message: `${key} only applies to vector and terrain maps, not to "${style.base}"`,
          values: { key, base: style.base },
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
