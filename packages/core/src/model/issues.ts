import type { z } from 'zod';

/**
 * Stable codes for our own rules. Messages in core stay English (they also go to logs and API
 * responses); the editor shows them in German by looking up the code.
 */
export type IssueCode =
  // Always checked ("storable")
  | 'lngLat.longitudeRange'
  | 'lngLat.latitudeRange'
  | 'lngLat.swapped'
  | 'waypoint.shapeHold'
  | 'routing.avoidOnlyRoad'
  | 'track.routingNotAllowed'
  | 'track.flightOnlyPlane'
  | 'style.onlyThemedBases'
  | 'output.transparentNeedsProres'
  | 'view.flat2d'
  | 'project.duplicateId'
  // Checked before preview and export ("renderable", ADR 0002)
  | 'etappe.noTracks'
  | 'track.tooFewWaypoints'
  | 'track.endpointNotStop'
  | 'track.timingOutsideEtappe'
  | 'camera.followTrackMissing'
  | 'camera.followTrackForeign'
  | 'camera.staticMissing';

/** Values the message refers to, so a translation can use them too. */
export type IssueValues = Record<string, string | number>;

export interface ValidationIssue {
  /** Where the problem is, e.g. groups[0].etappen[1].tracks[0].waypoints[0].lngLat[1] */
  path: string;
  message: string;
  /** Present for our own rules; missing for Zod's built-in checks (types, ranges …). */
  code?: IssueCode;
  values?: IssueValues;
}

export interface CustomIssue {
  path: PropertyKey[];
  input: unknown;
  code: IssueCode;
  message: string;
  values?: IssueValues;
}

/** Adds one of our own rules to a Zod refinement, with its code carried along in `params`. */
export function reportIssue(ctx: z.core.$RefinementCtx, issue: CustomIssue): void {
  ctx.addIssue({
    code: 'custom',
    path: issue.path,
    input: issue.input,
    message: issue.message,
    params: { issueCode: issue.code, values: issue.values ?? {} },
  });
}
