import { z } from 'zod';
import {
  EasingSchema,
  RoadAvoidSchema,
  RoutingModeSchema,
  VehicleTypeSchema,
  WaypointKindSchema,
  WaypointSourceSchema,
} from './enums';
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
      ctx.addIssue({
        code: 'custom',
        path: ['holdSec'],
        input: waypoint.holdSec,
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
      ctx.addIssue({
        code: 'custom',
        path: ['avoid'],
        input: routing.avoid,
        message: `avoid only applies to road routing, not to "${routing.mode}"`,
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

export const TrackStyleSchema = z.strictObject({
  lineColor: HexColorSchema,
  lineWidthPx: z.number().positive(),
  lineDash: z.enum(['solid', 'dashed', 'dotted']),
  /** 'ghost' shows the whole route faintly before the vehicle gets there. */
  futureRoute: z.enum(['hidden', 'ghost']),
  glow: z.boolean(),
  vehicleScale: z.number().positive(),
  /** Short badge for route options such as "A", "B", "C". */
  variantBadge: z.string().min(1).max(3).optional(),
});
export type TrackStyle = z.infer<typeof TrackStyleSchema>;

export const FlightOptionsSchema = z.strictObject({
  /** Arc height as a share of the distance. Deliberately exaggerated: real cruising altitude would be invisible. */
  arcHeightFactor: z.number().min(0),
  showGroundShadow: z.boolean(),
  takeoffLandingCamera: z.boolean(),
});
export type FlightOptions = z.infer<typeof FlightOptionsSchema>;

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
    /** Cache written by the server. Never edited by hand. */
    computed: ComputedRouteSchema.optional(),
  })
  .superRefine((track, ctx) => {
    const { waypoints, routing, vehicle } = track;

    // A GPX import carries its own geometry, so it may get by with fewer waypoints.
    const hasGpxGeometry = routing.mode === 'gpx' && track.computed !== undefined;
    if (waypoints.length < 2 && !hasGpxGeometry) {
      ctx.addIssue({
        code: 'custom',
        path: ['waypoints'],
        input: waypoints,
        message: `A track needs at least 2 waypoints, got ${waypoints.length}`,
      });
    }

    const lastIndex = waypoints.length - 1;
    for (const index of new Set([0, lastIndex])) {
      const waypoint = waypoints[index];
      if (waypoint && waypoint.kind !== 'stop') {
        ctx.addIssue({
          code: 'custom',
          path: ['waypoints', index, 'kind'],
          input: waypoint.kind,
          message: `The ${index === 0 ? 'first' : 'last'} waypoint must be a stop, not a shape point`,
        });
      }
    }

    if (!isRoutingAllowed(vehicle.type, routing.mode)) {
      const allowed = VEHICLE_CATALOG[vehicle.type].routingModes.join(', ');
      ctx.addIssue({
        code: 'custom',
        path: ['routing', 'mode'],
        input: routing.mode,
        message: `A ${vehicle.type} cannot use "${routing.mode}" routing; allowed: ${allowed}`,
      });
    }

    if (track.flight !== undefined && vehicle.type !== 'plane') {
      ctx.addIssue({
        code: 'custom',
        path: ['flight'],
        input: track.flight,
        message: `Flight options only apply to planes, not to a ${vehicle.type}`,
      });
    }
  });
export type Track = z.infer<typeof TrackSchema>;
