import { z } from 'zod';
import { CameraModeSchema, ViewModeSchema } from './enums';
import { reportIssue } from './issues';
import { IdSchema, LngLatSchema } from './primitives';
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

export const OverlaySettingsSchema = z.strictObject({
  labels: z.boolean(),
  distanceCounter: z.boolean(),
  timeCounter: z.boolean(),
  /** For example "2 h 35 min"; overrides the duration from routing. */
  manualDurationText: z.string().optional(),
  title: z.string().optional(),
  attribution: z.boolean(),
  /** The height profile of the profile track, with a point that moves along (ADR 0012). */
  elevationProfile: z.boolean(),
  /** Metres climbed and descended so far. */
  elevationCounter: z.boolean(),
});
export type OverlaySettings = z.infer<typeof OverlaySettingsSchema>;

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
});
export type Etappe = z.infer<typeof EtappeSchema>;
