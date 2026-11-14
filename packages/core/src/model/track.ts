import { z } from 'zod';
import { AssetIdSchema } from './assets';
import {
  EasingSchema,
  LineDashSchema,
  RoadAvoidSchema,
  RoutingModeSchema,
  VehicleTypeSchema,
  WaypointKindSchema,
  WaypointSourceSchema,
} from './enums';
import { reportIssue } from './issues';
import { HexColorSchema, IdSchema, IsoDateTimeSchema, LngLatSchema } from './primitives';
import { isRoutingAllowed, VEHICLE_CATALOG } from './vehicles';

export const WaypointSchema = z
  .strictObject({
    id: IdSchema,
    lngLat: LngLatSchema,
    name: z.string(),
    /** 'stop' is a real halt with a label; 'shape' only bends the route and stays invisible. */
    kind: WaypointKindSchema,
    source: WaypointSourceSchema,
    airportCode: z
      .string()
      .regex(/^[A-Z]{3}$/, 'Expected a three-letter IATA code such as VIE')
      .optional(),
    holdSec: z.number().min(0),
    showLabel: z.boolean(),
  })
  .superRefine((waypoint, ctx) => {
    if (waypoint.kind === 'shape' && waypoint.holdSec > 0) {
      reportIssue(ctx, {
        path: ['holdSec'],
        input: waypoint.holdSec,
        code: 'waypoint.shapeHold',
        message: 'Shape points are invisible and cannot have a hold; make it a stop instead',
      });
    }
  });
export type Waypoint = z.infer<typeof WaypointSchema>;

export const RoutingSettingsSchema = z
  .strictObject({
    mode: RoutingModeSchema,
    avoid: z.array(RoadAvoidSchema).optional(),
  })
  .superRefine((routing, ctx) => {
    if (routing.avoid !== undefined && routing.mode !== 'road') {
      reportIssue(ctx, {
        path: ['avoid'],
        input: routing.avoid,
        code: 'routing.avoidOnlyRoad',
        message: `avoid only applies to road routing, not to "${routing.mode}"`,
        values: { mode: routing.mode },
      });
    }
  });
export type RoutingSettings = z.infer<typeof RoutingSettingsSchema>;

export const TrackTimingSchema = z.strictObject({
  /** Start relative to the beginning of the stage. */
  startOffsetSec: z.number().min(0),
  /** Missing means: drive until the stage ends. */
  durationSec: z.number().positive().optional(),
  easing: EasingSchema,
});
export type TrackTiming = z.infer<typeof TrackTimingSchema>;

/**
 * The part of the route the vehicle has not driven yet (ADR 0008). Colour and width are the
 * driven line's; glow and the white casing stay with the driven line.
 */
export const RouteAheadSchema = z.strictObject({
  /** 0 hides the route ahead, 1 draws it as strongly as the driven line. */
  opacity: z.number().min(0).max(1),
  dash: LineDashSchema,
});
export type RouteAhead = z.infer<typeof RouteAheadSchema>;

/** What stands for the vehicle on the map (ADR 0009). */
export const VehicleIconSchema = z.discriminatedUnion('kind', [
  /** The vehicle type's own icon; cars and planes show their 3D model in tilted views. */
  z.strictObject({ kind: z.literal('catalog') }),
  z.strictObject({
    kind: z.literal('image'),
    assetId: AssetIdSchema,
    /** Lies flat and turns with the heading; otherwise it stands upright, facing the viewer. */
    rotates: z.boolean(),
  }),
  /** No vehicle at all, only the line. */
  z.strictObject({ kind: z.literal('none') }),
]);
export type VehicleIcon = z.infer<typeof VehicleIconSchema>;

export const TrackStyleSchema = z.strictObject({
  lineColor: HexColorSchema,
  lineWidthPx: z.number().positive(),
  /** The driven line. */
  lineDash: LineDashSchema,
  ahead: RouteAheadSchema,
  glow: z.boolean(),
  vehicleScale: z.number().positive(),
  icon: VehicleIconSchema,
});
export type TrackStyle = z.infer<typeof TrackStyleSchema>;

export const FlightOptionsSchema = z.strictObject({
  /** Arc height as a share of the distance. Deliberately exaggerated: real cruising altitude would be invisible. */
  arcHeightFactor: z.number().min(0),
  showGroundShadow: z.boolean(),
  takeoffLandingCamera: z.boolean(),
});
export type FlightOptions = z.infer<typeof FlightOptionsSchema>;

/**
 * Heights along a computed route (ADR 0012), for the elevation profile, the climb counter and
 * flights that start in the mountains. Sample i lies min(i · stepM, length) metres along the
 * geometry, measured with core's own geo functions.
 */
export const RouteElevationSchema = z.strictObject({
  /**
   * 'dem' is sampled from terrain tiles by the server; 'gpx' comes from an imported file (GPX,
   * or the altitudes of a DJI subtitle file, ADR 0014).
   */
  source: z.enum(['dem', 'gpx']),
  stepM: z.number().positive(),
  /** Metres above sea level. */
  elevationsM: z.array(z.number()).min(2),
});
export type RouteElevation = z.infer<typeof RouteElevationSchema>;

/**
 * A line read from a file (ADR 0014): a GPX track or the GPS of a DJI drone's subtitle file.
 * The route of a `gpx` track is built from it, with the stops laid onto it, so editing a stop
 * never loses the line.
 */
export const ImportedLineSchema = z.strictObject({
  source: z.enum(['gpx', 'dji-srt']),
  /** The file it came from, to recognise it in the editor. */
  name: z.string(),
  /** Simplified like router routes (5 m, ADR 0005). */
  line: z.array(LngLatSchema).min(2),
  /** Metres above sea level per point of `line`, when the file had them. */
  elevationsM: z.array(z.number()).optional(),
  /** SHA-256 over the line; part of the route's input hash. */
  fingerprint: z.string().min(1),
});
export type ImportedLine = z.infer<typeof ImportedLineSchema>;

/** Route computed by the server and stored in the project, so rendering works offline and reproducibly. */
export const ComputedRouteSchema = z.strictObject({
  /** Hash over waypoints (lngLat, kind) and routing; see routing/inputHash.ts. */
  inputHash: z.string().min(1),
  geometry: z.array(LngLatSchema).min(2),
  legs: z.array(
    z.strictObject({
      fromWaypointId: IdSchema,
      toWaypointId: IdSchema,
      /** Index in `geometry` where this leg starts. */
      startIndex: z.number().int().min(0),
      distanceM: z.number().min(0),
      durationS: z.number().min(0).optional(),
    }),
  ),
  distanceM: z.number().min(0),
  durationS: z.number().min(0).optional(),
  provider: z.string().min(1),
  computedAt: IsoDateTimeSchema,
  /** Filled in later, and only where a stage needs heights; goes with the geometry it belongs to. */
  elevation: RouteElevationSchema.optional(),
});
export type ComputedRoute = z.infer<typeof ComputedRouteSchema>;

export const TrackSchema = z
  .strictObject({
    id: IdSchema,
    label: z.string().optional(),
    vehicle: z.strictObject({
      type: VehicleTypeSchema,
      /** Icon or model ID from the vehicle catalog. */
      variant: z.string().min(1),
    }),
    routing: RoutingSettingsSchema,
    waypoints: z.array(WaypointSchema),
    timing: TrackTimingSchema,
    style: TrackStyleSchema,
    flight: FlightOptionsSchema.optional(),
    /** The line of a GPX or DJI import; the `gpx` routing mode needs it (ADR 0014). */
    imported: ImportedLineSchema.optional(),
    /** Cache written by the server. Never edited by hand. */
    computed: ComputedRouteSchema.optional(),
  })
  // Only rules that no editing step can legitimately break. Waypoint count and stop/shape
  // endpoints may be unfinished while editing; they are checked in readiness.ts (ADR 0002).
  .superRefine((track, ctx) => {
    const { routing, vehicle } = track;

    if (!isRoutingAllowed(vehicle.type, routing.mode)) {
      const allowed = VEHICLE_CATALOG[vehicle.type].routingModes.join(', ');
      reportIssue(ctx, {
        path: ['routing', 'mode'],
        input: routing.mode,
        code: 'track.routingNotAllowed',
        message: `A ${vehicle.type} cannot use "${routing.mode}" routing; allowed: ${allowed}`,
        values: { vehicle: vehicle.type, mode: routing.mode, allowed },
      });
    }

    if (track.flight !== undefined && vehicle.type !== 'plane') {
      reportIssue(ctx, {
        path: ['flight'],
        input: track.flight,
        code: 'track.flightOnlyPlane',
        message: `Flight options only apply to planes, not to a ${vehicle.type}`,
        values: { vehicle: vehicle.type },
      });
    }

    if (track.imported !== undefined && routing.mode !== 'gpx') {
      reportIssue(ctx, {
        path: ['imported'],
        input: track.imported.name,
        code: 'track.importOnlyGpx',
        message: `An imported line belongs to the gpx routing mode, not to "${routing.mode}"`,
        values: { mode: routing.mode },
      });
    }
    if (
      track.imported?.elevationsM &&
      track.imported.elevationsM.length !== track.imported.line.length
    ) {
      reportIssue(ctx, {
        path: ['imported', 'elevationsM'],
        input: track.imported.elevationsM.length,
        code: 'track.importElevations',
        message: `An imported line needs one height per point (${track.imported.line.length}), got ${track.imported.elevationsM.length}`,
      });
    }
  });
export type Track = z.infer<typeof TrackSchema>;
