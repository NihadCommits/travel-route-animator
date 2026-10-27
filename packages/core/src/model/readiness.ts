import type { Etappe } from './etappe';
import type { IssueCode, IssueValues, ValidationIssue } from './issues';
import type { Id } from './primitives';
import { formatPath, type Project } from './project';

/**
 * The second check level from ADR 0002 ("renderable"). A stored project may be unfinished;
 * preview and export call this first and stop with these messages instead of failing later
 * inside the renderer.
 */
export interface ReadinessIssue extends ValidationIssue {
  code: IssueCode;
  etappeId: Id;
}

// Small tolerance so that 2.3 + 5.7 <= 8 does not fail on floating point noise.
const EPSILON_SEC = 1e-6;

/**
 * Holds at stops may take at most this share of a track's time; the rest is for driving.
 * The timeline shortens longer holds to it, so the stage still plays until this is fixed.
 */
export const MAX_HOLD_SHARE = 0.9;

/** All problems that keep stages from being rendered; pass IDs to check only some stages. */
export function checkRenderReadiness(
  project: Project,
  etappeIds?: readonly Id[],
): ReadinessIssue[] {
  const wanted = etappeIds ? new Set(etappeIds) : undefined;
  const issues: ReadinessIssue[] = [];
  project.groups.forEach((group, g) => {
    group.etappen.forEach((etappe, e) => {
      if (!wanted || wanted.has(etappe.id)) {
        issues.push(...checkEtappeReadiness(etappe, ['groups', g, 'etappen', e]));
      }
    });
  });
  return issues;
}

export function checkEtappeReadiness(
  etappe: Etappe,
  basePath: readonly PropertyKey[] = [],
): ReadinessIssue[] {
  const issues: ReadinessIssue[] = [];
  const report = (
    path: readonly PropertyKey[],
    code: IssueCode,
    message: string,
    values: IssueValues = {},
  ) => {
    issues.push({
      path: formatPath([...basePath, ...path]),
      message,
      code,
      values,
      etappeId: etappe.id,
    });
  };

  if (etappe.tracks.length === 0) {
    report(['tracks'], 'etappe.noTracks', 'A stage needs at least one vehicle (track)');
  }

  etappe.tracks.forEach((track, t) => {
    const { waypoints, routing } = track;

    // A GPX import carries its own geometry, so it may get by with fewer waypoints.
    const hasGpxGeometry = routing.mode === 'gpx' && track.computed !== undefined;
    if (waypoints.length < 2 && !hasGpxGeometry) {
      report(
        ['tracks', t, 'waypoints'],
        'track.tooFewWaypoints',
        `A track needs at least 2 waypoints, got ${waypoints.length}`,
        { count: waypoints.length },
      );
    }

    for (const index of new Set([0, waypoints.length - 1])) {
      const waypoint = waypoints[index];
      if (waypoint && waypoint.kind !== 'stop') {
        const end = index === 0 ? 'first' : 'last';
        report(
          ['tracks', t, 'waypoints', index, 'kind'],
          'track.endpointNotStop',
          `The ${end} waypoint must be a stop, not a shape point`,
          { end },
        );
      }
    }

    const { startOffsetSec, durationSec } = track.timing;
    const endSec = startOffsetSec + (durationSec ?? 0);
    if (startOffsetSec >= etappe.durationSec || endSec > etappe.durationSec + EPSILON_SEC) {
      report(
        ['tracks', t, 'timing'],
        'track.timingOutsideEtappe',
        durationSec === undefined
          ? `Track starts at ${startOffsetSec} s, but the stage is only ${etappe.durationSec} s long`
          : `Track runs until ${endSec} s, but the stage is only ${etappe.durationSec} s long`,
        { startSec: startOffsetSec, endSec, etappeSec: etappe.durationSec },
      );
    }

    const trackSec = durationSec ?? etappe.durationSec - startOffsetSec;
    const holdSec = waypoints.reduce((sum, w) => sum + (w.kind === 'stop' ? w.holdSec : 0), 0);
    if (holdSec > 0 && holdSec > trackSec * MAX_HOLD_SHARE + EPSILON_SEC) {
      report(
        ['tracks', t, 'waypoints'],
        'track.holdsTooLong',
        `The holds add up to ${holdSec} s, which leaves almost no time to drive in ${trackSec} s`,
        { holdSec, trackSec },
      );
    }
  });

  const { camera } = etappe.view;
  if (camera.mode === 'follow' && camera.followTrackId === undefined) {
    report(
      ['view', 'camera', 'followTrackId'],
      'camera.followTrackMissing',
      'Camera mode "follow" needs followTrackId',
    );
  }
  if (
    camera.followTrackId !== undefined &&
    !etappe.tracks.some((track) => track.id === camera.followTrackId)
  ) {
    report(
      ['view', 'camera', 'followTrackId'],
      'camera.followTrackForeign',
      `The camera follows track "${camera.followTrackId}", which is not part of this stage`,
      { trackId: camera.followTrackId },
    );
  }
  if (camera.mode === 'static' && camera.staticCamera === undefined) {
    report(
      ['view', 'camera', 'staticCamera'],
      'camera.staticMissing',
      'Camera mode "static" needs staticCamera',
    );
  }

  return issues;
}
