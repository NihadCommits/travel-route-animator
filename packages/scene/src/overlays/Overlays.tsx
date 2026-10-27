import { routingCredits, type FrameState, type Timeline } from '@travel-route-animator/core';
import { OPENFREEMAP_ATTRIBUTION } from '@travel-route-animator/styles';
import type { CSSProperties, FC } from 'react';

// HTML on top of the map, in the same reference size (1080 pixels on the short side) and
// scaled with it. Everything comes from the frame state; no CSS transitions (Determinismus).

/** System fonts for now; own fonts per theme come with M9. */
const FONT = '"Segoe UI", "Noto Sans", "Helvetica Neue", Arial, sans-serif';

const pill: CSSProperties = {
  position: 'absolute',
  padding: '10px 22px',
  borderRadius: 14,
  backgroundColor: 'rgba(15, 23, 42, 0.72)',
  color: '#ffffff',
  fontFamily: FONT,
  fontWeight: 700,
  // Digits of equal width, so the counter does not wobble while it counts.
  fontVariantNumeric: 'tabular-nums',
};

const kilometres = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 0 });

export const Overlays: FC<{ timeline: Timeline; state: FrameState }> = ({ timeline, state }) => {
  const { overlays, viewport, scale } = timeline;
  const { distanceKm } = state.counters;
  const credits = [
    OPENFREEMAP_ATTRIBUTION,
    ...routingCredits(timeline.tracks.map((t) => t.provider)),
  ];

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
      }}
    >
      {overlays.title && (
        <div style={{ ...pill, left: 48, top: 44, fontSize: 52 }}>{overlays.title}</div>
      )}
      {distanceKm !== undefined && (
        <div style={{ ...pill, left: 48, bottom: 44, fontSize: 44 }}>
          {kilometres.format(distanceKm)} km
        </div>
      )}
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
            fontFamily: FONT,
            fontSize: 15,
          }}
        >
          {credits.join(' · ')}
        </div>
      )}
    </div>
  );
};
