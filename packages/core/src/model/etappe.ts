import { z } from 'zod';
import { CameraModeSchema, ViewModeSchema } from './enums';
import { reportIssue } from './issues';
import { AssetIdSchema } from './assets';
import { IdSchema, LngLatSchema } from './primitives';
import { isTimeZone } from '../time/zone';
import { OverlayStyleRefSchema, WidgetSchema } from './overlays';
import { MapStyleRefSchema } from './style';
import { TrackSchema } from './track';

const PitchSchema = z.number().min(0).max(85);
const ZoomSchema = z.number().min(0).max(24);

// Whether follow/static have their target is checked in readiness.ts (ADR 0002): switching the
// camera mode in the editor comes before choosing the track to follow.
export const CameraSettingsSchema = z.strictObject({
  mode: CameraModeSchema,
  /** Needed for 'follow'; must point at a track of the same stage. */
  followTrackId: IdSchema.optional(),
  /** Optional fixed zoom while following. */
  zoom: ZoomSchema.optional(),
  paddingPx: z.number().min(0),
  /** How far the camera trails behind the vehicle (0 = rigid). */
  lagSec: z.number().min(0),
  startWithOverview: z.boolean(),
  endWithOverview: z.boolean(),
  /** Needed for 'static'. */
  staticCamera: z
    .strictObject({
      center: LngLatSchema,
      zoom: ZoomSchema,
      pitchDeg: PitchSchema,
      bearingDeg: z.number(),
    })
    .optional(),
});
export type CameraSettings = z.infer<typeof CameraSettingsSchema>;

export const ViewSettingsSchema = z
  .strictObject({
    mode: ViewModeSchema,
    pitchDeg: PitchSchema,
    bearingDeg: z.number(),
    camera: CameraSettingsSchema,
    terrain: z.strictObject({ enabled: z.boolean(), exaggeration: z.number().positive() }),
    buildings3d: z.boolean(),
  })
  .superRefine((view, ctx) => {
    if (view.mode === '2d' && view.pitchDeg !== 0) {
      reportIssue(ctx, {
        path: ['pitchDeg'],
        input: view.pitchDeg,
        code: 'view.flat2d',
        message: `A 2d view looks straight down, so pitchDeg must be 0 (got ${view.pitchDeg}); use 3d-tilted for a tilted map`,
        values: { pitch: view.pitchDeg },
      });
    }
  });
export type ViewSettings = z.infer<typeof ViewSettingsSchema>;

const PositiveSec = z.number().positive();

export const IntroSettingsSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('none') }),
  /** Starts low above the start point and zooms out. */
  z.strictObject({ type: z.literal('dive-out'), durationSec: PositiveSec }),
  z.strictObject({ type: z.literal('overview-to-start'), durationSec: PositiveSec }),
]);
export type IntroSettings = z.infer<typeof IntroSettingsSchema>;

export const OutroSettingsSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('none') }),
  z.strictObject({ type: z.literal('overview'), durationSec: PositiveSec }),
  z.strictObject({
    type: z.literal('arrival-3d'),
    durationSec: PositiveSec,
    pitchDeg: PitchSchema,
    orbitDeg: z.number(),
  }),
  /** Zooms deep onto the destination so that a hard cut to footage feels seamless. */
  z.strictObject({
    type: z.literal('dive-in'),
    durationSec: PositiveSec,
    targetZoom: ZoomSchema,
    switchToSatellite: z.boolean(),
    effect: z.enum(['none', 'blur', 'flash', 'fade-white', 'fade-black']),
    exportEndFrame: z.boolean(),
  }),
]);
export type OutroSettings = z.infer<typeof OutroSettingsSchema>;

/** Where the map credits sit in the picture (ADR 0013). */
export const CornerSchema = z.enum(['bottom-right', 'bottom-left', 'top-right', 'top-left']);
export type Corner = z.infer<typeof CornerSchema>;

export const OverlaySettingsSchema = z.strictObject({
  /** Stop names on the map. */
  labels: z.boolean(),
  /** For example "2 h 35 min"; overrides the duration from routing (travel time, clock). */
  manualDurationText: z.string().optional(),
  attribution: z.boolean(),
  attributionCorner: CornerSchema,
  /** The blocks on top of the map (M17, ADR 0017). */
  widgets: z.array(WidgetSchema),
  /** The stage's own look; missing means the group's or the project's. */
  style: OverlayStyleRefSchema.optional(),
});
export type OverlaySettings = z.infer<typeof OverlaySettingsSchema>;

/**
 * When a pin opens (ADR 0014): as the stage's profile vehicle passes it, or at a set time
 * (seconds into the main part).
 */
export const PinTriggerSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('pass') }),
  z.strictObject({ mode: z.literal('time'), atSec: z.number().min(0) }),
]);
export type PinTrigger = z.infer<typeof PinTriggerSchema>;

/** A photo or a place name that pops up along the route and goes again (M14, ADR 0014). */
export const PinSchema = z
  .strictObject({
    id: IdSchema,
    kind: z.enum(['photo', 'place']),
    lngLat: LngLatSchema,
    /** The place's name, or a caption under the photo. */
    title: z.string(),
    /** Photos: the picture, an image asset of the project. */
    assetId: AssetIdSchema.optional(),
    trigger: PinTriggerSchema,
    /** How long it stays open. */
    durationSec: z.number().positive(),
  })
  .superRefine((pin, ctx) => {
    if (pin.kind === 'photo' && pin.assetId === undefined) {
      reportIssue(ctx, {
        path: ['assetId'],
        input: pin.assetId,
        code: 'pin.photoNeedsAsset',
        message: 'A photo pin needs its picture (assetId)',
      });
    }
  });
export type Pin = z.infer<typeof PinSchema>;

/**
 * The time of day a stage shows (M16, ADR 0017). 'manual': from a typed departure, running on
 * with the travel time (typed duration, recording or router). 'recorded': from when the
 * recording of the counted track started.
 */
export const ClockSchema = z
  .strictObject({
    source: z.enum(['manual', 'recorded']),
    /** Local date and time of departure, e.g. "2026-07-14T08:30". */
    departure: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
      .optional(),
    /** The IANA time zone the clock is in, e.g. "Europe/Vienna". */
    timeZone: z.string().min(1),
  })
  .superRefine((clock, ctx) => {
    if (!isTimeZone(clock.timeZone)) {
      reportIssue(ctx, {
        path: ['timeZone'],
        input: clock.timeZone,
        code: 'clock.timeZone',
        message: `Unknown time zone "${clock.timeZone}"`,
      });
    }
  });
export type Clock = z.infer<typeof ClockSchema>;

// A stage may be unfinished while editing (no vehicle yet, timing longer than the stage after
// shortening it, camera following a deleted track). Those checks live in readiness.ts (ADR 0002).
export const EtappeSchema = z.strictObject({
  id: IdSchema,
  name: z.string(),
  /** Length of the drive animation, without intro and outro. */
  durationSec: PositiveSec,
  view: ViewSettingsSchema,
  mapStyle: MapStyleRefSchema.optional(),
  intro: IntroSettingsSchema,
  outro: OutroSettingsSchema,
  overlays: OverlaySettingsSchema,
  /** Tracks run in parallel. */
  tracks: z.array(TrackSchema),
  /** Photos and places that pop up along the way (ADR 0014). */
  pins: z.array(PinSchema),
  clock: ClockSchema.optional(),
});
export type Etappe = z.infer<typeof EtappeSchema>;
