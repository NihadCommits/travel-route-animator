import { isLocalRoutingMode, isRouteStale, type Track } from '@travel-route-animator/core';
import { Route } from 'lucide-react';
import { de, formatDistance, formatDuration } from '@/i18n/de';

const texts = de.inspector.track.route;

/** Below the routing mode: whether the route fits the points, how long it is, who made it. */
export function RouteStatus({ track }: { track: Track }) {
  const { computed } = track;
  let text: string;
  if (computed && !isRouteStale(track)) {
    const via = texts.providers[computed.provider] ?? computed.provider;
    const length = [formatDistance(computed.distanceM)];
    if (computed.durationS !== undefined) length.push(formatDuration(computed.durationS));
    text = texts.fresh(length.join(' · '), via);
  } else if (track.waypoints.length < 2) {
    text = texts.tooFewPoints;
  } else if (isLocalRoutingMode(track.routing.mode)) {
    // The store computes these with every edit, so this shows for a moment at most.
    text = texts.computing;
  } else {
    text = texts.roadLater;
  }

  return (
    <p
      role="status"
      aria-label={texts.label}
      className="text-muted-foreground -mt-1 flex items-start gap-1.5 text-xs"
    >
      <Route className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>{text}</span>
    </p>
  );
}
