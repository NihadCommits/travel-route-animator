import { routingCredits, type FrameState, type Timeline } from '@travel-route-animator/core';
import type { CSSProperties, FC } from 'react';
import { climbText, ElevationProfileChart } from './ElevationProfile';

// HTML on top of the map, in the same reference size (1080 pixels on the short side) and
// scaled with it. Everything comes from the frame state; no CSS transitions (Determinismus).

/** System fonts; own fonts for the overlays are an idea for later (M9 plan). */
const FONT = '"Segoe UI", "Noto Sans", "Helvetica Neue", Arial, sans-serif';

const pill: CSSProperties = {
  padding: '10px 22px',
  borderRadius: 14,
  backgroundColor: 'rgba(15, 23, 42, 0.72)',
  color: '#ffffff',
  fontWeight: 700,
};

const kilometres = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 0 });

/** The profile panel's width: wide enough to read, never wider than the picture allows. */
const PROFILE_WIDTH = 860;
const MARGIN = 48;

export const Overlays: FC<{
  timeline: Timeline;
  state: FrameState;
  /** The map's own credits, by source (styleCredits). */
  credits: readonly string[];
}> = ({ timeline, state, credits: mapCredits }) => {
  const { overlays, viewport, scale } = timeline;
  const { distanceKm } = state.counters;
  const credits = [...mapCredits, ...routingCredits(timeline.tracks.map((t) => t.provider))];
  // Heights only once the route has them (ADR 0012); the editor fetches them in the background.
  const reading = state.elevation;
  const profile = timeline.elevation;
  const profileColor =
    timeline.tracks.find((plan) => plan.trackId === profile?.trackId)?.style.lineColor ?? '#ffffff';
  const showProfile = overlays.elevationProfile && profile && reading;
  const showClimb = overlays.elevationCounter && reading && !showProfile;

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: viewport.width,
        height: viewport.height,
        transform: scale === 1 ? undefined : `scale(${scale})`,
        transformOrigin: 'top left',
        pointerEvents: 'none',
        fontFamily: FONT,
        // Digits of equal width, so the counters do not wobble while they count.
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {overlays.title && (
        <div style={{ ...pill, position: 'absolute', left: MARGIN, top: 44, fontSize: 52 }}>
          {overlays.title}
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          left: MARGIN,
          bottom: 44,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 16,
        }}
      >
        {distanceKm !== undefined && (
          <div style={{ ...pill, fontSize: 44 }}>{kilometres.format(distanceKm)} km</div>
        )}
        {showClimb && (
          <div style={{ ...pill, fontSize: 40, whiteSpace: 'pre' }}>{climbText(reading)}</div>
        )}
        {showProfile && (
          <ElevationProfileChart
            profile={profile.profile}
            reading={reading}
            color={profileColor}
            width={Math.min(PROFILE_WIDTH, viewport.width - 2 * MARGIN)}
            counter={overlays.elevationCounter}
          />
        )}
      </div>
      {overlays.attribution && (
        <div
          style={{
            position: 'absolute',
            right: 12,
            bottom: 10,
            padding: '3px 9px',
            borderRadius: 5,
            backgroundColor: 'rgba(255, 255, 255, 0.78)',
            color: '#333333',
            fontSize: 15,
          }}
        >
          {credits.join(' · ')}
        </div>
      )}
    </div>
  );
};
