import {
  isLocalRoutingMode,
  isRouteStale,
  type RouterId,
  type Track,
} from '@travel-route-animator/core';
import { Route, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { de, formatDistance, formatDuration } from '@/i18n/de';
import { useEditor, type RouteJob, type RouteJobFailure } from '@/state/editorStore';

const texts = de.inspector.track.route;
const routerName = (router: RouterId) => texts.providers[router] ?? router;
const otherRouter = (router: RouterId): RouterId => (router === 'ors' ? 'osrm' : 'ors');

function failureText(failure: RouteJobFailure, router: RouterId, track: Track): string {
  const { failures } = texts;
  switch (failure.error) {
    case 'point_not_found': {
      // The router counts the points sent, which are all waypoints of the track in order.
      const index = failure.waypointIndex;
      const waypoint = index === undefined ? undefined : track.waypoints[index];
      if (!waypoint || index === undefined) return failures.point_not_found_unknown;
      return failures.point_not_found(waypoint.name || de.waypoints.number(index + 1));
    }
    case 'quota':
    case 'unavailable':
      return failures[failure.error](routerName(router));
    default:
      return failures[failure.error];
  }
}

/** Asking the same router again only helps when the service, not the points, was the problem. */
const RETRYABLE = new Set<RouteJobFailure['error']>([
  'quota',
  'unavailable',
  'no_key',
  'key_rejected',
  'server_down',
]);

function FailureActions({ job, trackId }: { job: RouteJob; trackId: string }) {
  const retryRoute = useEditor((state) => state.retryRoute);
  const kind = job.failure?.error;
  if (!kind || kind === 'too_long') return null;
  const other = otherRouter(job.router);
  return (
    <div className="flex flex-wrap gap-1.5">
      {RETRYABLE.has(kind) && (
        <Button size="xs" variant="outline" onClick={() => retryRoute(trackId, job.router)}>
          {texts.retry}
        </Button>
      )}
      {/* The other router may well find a way, or snap a point this one could not place. */}
      {kind !== 'server_down' && (
        <Button size="xs" variant="outline" onClick={() => retryRoute(trackId, other)}>
          {texts.useRouter(routerName(other))}
        </Button>
      )}
    </div>
  );
}

/** Below the routing mode: whether the route fits the points, how long it is, who made it. */
export function RouteStatus({ track }: { track: Track }) {
  const job = useEditor((state) => state.routeJobs[track.id]);
  const { computed } = track;

  let text: string;
  let failed = false;
  if (computed && !isRouteStale(track)) {
    const via = texts.providers[computed.provider] ?? computed.provider;
    const length = [formatDistance(computed.distanceM)];
    if (computed.durationS !== undefined) length.push(formatDuration(computed.durationS));
    text = texts.fresh(length.join(' · '), via);
    if (computed.provider === 'osrm' && (track.routing.avoid?.length ?? 0) > 0) {
      text += ` ${texts.osrmIgnoresAvoid}`;
    }
  } else if (track.waypoints.length < 2) {
    text = texts.tooFewPoints;
  } else if (job?.state === 'failed' && job.failure && !isLocalRoutingMode(track.routing.mode)) {
    text = failureText(job.failure, job.router, track);
    failed = true;
  } else {
    // Planes and trains get their route with the edit; this shows for road routes while the
    // server is asked, and dashed straight lines stand in on the map meanwhile.
    text = texts.computing;
  }

  const Icon = failed ? TriangleAlert : Route;
  return (
    <div className="-mt-1 space-y-1.5">
      <p
        role="status"
        aria-label={texts.label}
        className={`flex items-start gap-1.5 text-xs ${failed ? 'text-destructive' : 'text-muted-foreground'}`}
      >
        <Icon className="mt-px size-3.5 shrink-0" aria-hidden />
        <span>{text}</span>
      </p>
      {failed && job && <FailureActions job={job} trackId={track.id} />}
    </div>
  );
}
