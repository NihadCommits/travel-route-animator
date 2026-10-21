import { z } from 'zod';
import { CameraModeSchema, ViewModeSchema } from './enums';
import { IdSchema, LngLatSchema } from './primitives';
import { MapStyleRefSchema } from './style';
import { TrackSchema } from './track';

// Small tolerance so that 2.3 + 5.7 <= 8 does not fail on floating point noise.
const EPSILON_SEC = 1e-6;

const PitchSchema = z.number().min(0).max(85);
const ZoomSchema = z.number().min(0).max(24);

export const CameraSettingsSchema = z
  .strictObject({
    mode: CameraModeSchema,
    /** Required for 'follow'; must point at a track of the same stage. */
    followTrackId: IdSchema.optional(),
    /** Optional fixed zoom while following. */
    zoom: ZoomSchema.optional(),
    paddingPx: z.number().min(0),
    /** How far the camera trails behind the vehicle (0 = rigid). */
    lagSec: z.number().min(0),
    startWithOverview: z.boolean(),
    endWithOverview: z.boolean(),
    staticCamera: z
      .strictObject({
        center: LngLatSchema,
        zoom: ZoomSchema,
        pitchDeg: PitchSchema,
        bearingDeg: z.number(),
      })
      .optional(),
  })
  .superRefine((camera, ctx) => {
    if (camera.mode === 'follow' && camera.followTrackId === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['followTrackId'],
        input: camera.followTrackId,
        message: 'Camera mode "follow" needs followTrackId',
      });
    }
    if (camera.mode === 'static' && camera.staticCamera === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['staticCamera'],
        input: camera.staticCamera,
        message: 'Camera mode "static" needs staticCamera',
      });
    }
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
      ctx.addIssue({
        code: 'custom',
        path: ['pitchDeg'],
        input: view.pitchDeg,
        message: `A 2d view looks straight down, so pitchDeg must be 0 (got ${view.pitchDeg}); use 3d-tilted for a tilted map`,
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
});
export type OverlaySettings = z.infer<typeof OverlaySettingsSchema>;

export const EtappeSchema = z
  .strictObject({
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
    tracks: z.array(TrackSchema).min(1, 'A stage needs at least one vehicle (track)'),
  })
  .superRefine((etappe, ctx) => {
    etappe.tracks.forEach((track, index) => {
      const { startOffsetSec, durationSec } = track.timing;
      const endSec = startOffsetSec + (durationSec ?? 0);
      if (startOffsetSec >= etappe.durationSec || endSec > etappe.durationSec + EPSILON_SEC) {
        ctx.addIssue({
          code: 'custom',
          path: ['tracks', index, 'timing'],
          input: track.timing,
          message:
            durationSec === undefined
              ? `Track starts at ${startOffsetSec} s, but the stage is only ${etappe.durationSec} s long`
              : `Track runs until ${endSec} s, but the stage is only ${etappe.durationSec} s long`,
        });
      }
    });

    const { followTrackId } = etappe.view.camera;
    if (followTrackId !== undefined && !etappe.tracks.some((t) => t.id === followTrackId)) {
      ctx.addIssue({
        code: 'custom',
        path: ['view', 'camera', 'followTrackId'],
        input: followTrackId,
        message: `The camera follows track "${followTrackId}", which is not part of this stage`,
      });
    }
  });
export type Etappe = z.infer<typeof EtappeSchema>;
