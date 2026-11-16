import { z } from 'zod';
import { HexColorSchema, IdSchema } from './primitives';

// The overlay kit (M17, ADR 0017): what the video shows on top of the map, as building blocks
// placed freely and styled with inherited looks. A block sits at a point of the picture (one of
// nine anchors) plus an offset in reference pixels (1080 on the short side), so it keeps its
// distance from the edge in 16:9 and in 9:16.

/** Where a block sits: the point of the picture, and which point of the block lies on it. */
export const ANCHORS = [
  'top-left',
  'top',
  'top-right',
  'left',
  'center',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
] as const;
export const AnchorSchema = z.enum(ANCHORS);
export type Anchor = z.infer<typeof AnchorSchema>;

/** What a block shows. Values come from the frame; 'text' shows its own text. */
export const WIDGET_KINDS = [
  'distance',
  'travelTime',
  'climb',
  'altitude',
  'elevationProfile',
  'progress',
  'speed',
  'heartRate',
  'cadence',
  'clock',
  'date',
  'place',
  'flag',
  'text',
] as const;
export const WidgetKindSchema = z.enum(WIDGET_KINDS);
export type WidgetKind = z.infer<typeof WidgetKindSchema>;

export const UnitsSchema = z.enum(['metric', 'imperial']);
export type Units = z.infer<typeof UnitsSchema>;

/** Fonts that come with the tool (SIL Open Font License), or the system's own sans-serif. */
export const OVERLAY_FONTS = [
  'system',
  'inter',
  'montserrat',
  'oswald',
  'bebas-neue',
  'playfair-display',
  'caveat',
  'jetbrains-mono',
] as const;
export const OverlayFontSchema = z.enum(OVERLAY_FONTS);
export type OverlayFont = z.infer<typeof OverlayFontSchema>;

export const OverlayBackgroundSchema = z.enum(['none', 'pill', 'box', 'glass']);
export type OverlayBackground = z.infer<typeof OverlayBackgroundSchema>;

/** The look of the blocks: everything a style sets. */
export const OverlayStyleTokensSchema = z.strictObject({
  font: OverlayFontSchema,
  weight: z.number().int().min(100).max(900),
  /** Text size of a value in reference pixels; labels and small parts follow it. */
  size: z.number().min(8).max(200),
  textColor: HexColorSchema,
  background: OverlayBackgroundSchema,
  backgroundColor: HexColorSchema,
  backgroundOpacity: z.number().min(0).max(1),
  /** Corner radius of a box in reference pixels; a pill is always round. */
  radius: z.number().min(0).max(200),
  /** A dark outline around the letters, for text without a background on bright maps. */
  outline: z.boolean(),
  shadow: z.boolean(),
  uppercase: z.boolean(),
});
export type OverlayStyleTokens = z.infer<typeof OverlayStyleTokensSchema>;

/** A style as the project, a group or a stage chooses it: a named style plus own changes. */
export const OverlayStyleRefSchema = z.strictObject({
  /** A built-in style (BUILT_IN_OVERLAY_STYLES) or the ID of an own one. */
  styleId: z.string().min(1),
  overrides: OverlayStyleTokensSchema.partial().optional(),
  /** Metric or imperial for a group or stage; missing means the project's (defaults.units). */
  units: UnitsSchema.optional(),
});
export type OverlayStyleRef = z.infer<typeof OverlayStyleRefSchema>;

/** An own style, kept outside the projects in data/overlay-styles/<id>.json. */
export const OverlayStyleSchema = z.strictObject({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  name: z.string().trim().min(1),
  tokens: OverlayStyleTokensSchema,
});
export type OverlayStyle = z.infer<typeof OverlayStyleSchema>;

export const WidgetSchema = z.strictObject({
  id: IdSchema,
  kind: WidgetKindSchema,
  anchor: AnchorSchema,
  /**
   * Stands right of this block of the same stage, in a row with it (rowsOf); its own anchor and
   * offsets then wait unused until it leaves the row.
   */
  after: IdSchema.optional(),
  /** Offset from the anchor in reference pixels: inwards from the edges, right/down from the middle. */
  dx: z.number(),
  dy: z.number(),
  /** Size relative to the style. */
  scale: z.number().min(0.2).max(5),
  /** A small caption above the value, e.g. "Gefahren". */
  label: z.string().optional(),
  /** What a 'text' block says, e.g. "Tag 4". */
  text: z.string().optional(),
  /** Metric or imperial for this block; missing means the project's units. */
  unit: UnitsSchema.optional(),
  /** Digits after the decimal point, for distance and speed. */
  decimals: z.number().int().min(0).max(2).optional(),
  /** Changes to the style for this block alone. */
  style: OverlayStyleTokensSchema.partial().optional(),
  /** Seconds into the main part when it appears and goes; missing: the whole stage. */
  fromSec: z.number().min(0).optional(),
  toSec: z.number().min(0).optional(),
  transition: z.enum(['none', 'fade', 'slide']),
});
export type Widget = z.infer<typeof WidgetSchema>;

/** The look of the counters until M17: white bold system font on a dark rounded box. */
const CLASSIC: OverlayStyleTokens = {
  font: 'system',
  weight: 700,
  size: 44,
  textColor: '#ffffff',
  background: 'box',
  backgroundColor: '#0f172a',
  backgroundOpacity: 0.72,
  radius: 14,
  outline: false,
  shadow: false,
  uppercase: false,
};

/** The styles that come with the tool, by ID. */
export const BUILT_IN_OVERLAY_STYLES: Record<string, OverlayStyleTokens> = {
  classic: CLASSIC,
  clean: {
    ...CLASSIC,
    font: 'inter',
    weight: 600,
    size: 42,
    textColor: '#0f172a',
    background: 'box',
    backgroundColor: '#ffffff',
    backgroundOpacity: 0.92,
    radius: 10,
  },
  bold: {
    ...CLASSIC,
    font: 'montserrat',
    weight: 800,
    size: 46,
    background: 'pill',
    backgroundColor: '#e4572e',
    backgroundOpacity: 1,
  },
  minimal: { ...CLASSIC, font: 'inter', background: 'none', shadow: true },
  glass: {
    ...CLASSIC,
    font: 'inter',
    weight: 600,
    size: 42,
    background: 'glass',
    // Dark frosted glass: a light one leaves white text unreadable on bright maps.
    backgroundColor: '#0f172a',
    backgroundOpacity: 0.32,
    radius: 18,
    shadow: true,
  },
  sport: {
    ...CLASSIC,
    font: 'oswald',
    weight: 600,
    size: 48,
    background: 'box',
    backgroundColor: '#111827',
    backgroundOpacity: 0.85,
    radius: 0,
    uppercase: true,
  },
  retro: {
    ...CLASSIC,
    font: 'bebas-neue',
    weight: 400,
    size: 58,
    textColor: '#1f2937',
    background: 'box',
    backgroundColor: '#f4d35e',
    backgroundOpacity: 1,
    radius: 4,
  },
  digital: {
    ...CLASSIC,
    font: 'jetbrains-mono',
    weight: 600,
    size: 40,
    textColor: '#a3e635',
    background: 'box',
    backgroundColor: '#000000',
    backgroundOpacity: 0.8,
    radius: 6,
  },
  elegant: {
    ...CLASSIC,
    font: 'playfair-display',
    weight: 700,
    size: 46,
    background: 'none',
    shadow: true,
  },
  handwritten: {
    ...CLASSIC,
    font: 'caveat',
    weight: 700,
    size: 58,
    background: 'none',
    shadow: true,
  },
};

/** The order the editor offers the built-in styles in. */
export const BUILT_IN_OVERLAY_STYLE_IDS = Object.keys(BUILT_IN_OVERLAY_STYLES);

/** A style's tokens: built in, one of the own styles, or Classic if it is gone; plus the changes. */
export function overlayTokensOf(
  ref: OverlayStyleRef,
  ownStyles: readonly OverlayStyle[] = [],
): OverlayStyleTokens {
  const base =
    BUILT_IN_OVERLAY_STYLES[ref.styleId] ??
    ownStyles.find((style) => style.id === ref.styleId)?.tokens ??
    CLASSIC;
  return { ...base, ...ref.overrides };
}

/** Whether a stage shows a block of this kind. */
export function hasWidget(widgets: readonly Widget[], kind: WidgetKind): boolean {
  return widgets.some((widget) => widget.kind === kind);
}
