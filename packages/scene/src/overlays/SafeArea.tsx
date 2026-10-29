import type { Timeline } from '@travel-route-animator/core';
import type { CSSProperties, FC } from 'react';

// Guides for the editor's preview only, never in the export: the usual action-safe (90 %) and
// title-safe (80 %) frames, and for vertical video the bands that Instagram Reels and TikTok
// roughly cover with their own buttons and captions. The bands are approximate: both apps
// change their layout from time to time.

const REELS_TOP_SHARE = 0.12;
const REELS_BOTTOM_SHARE = 0.22;

const frame = (inset: number, color: string): CSSProperties => ({
  position: 'absolute',
  inset: `${inset}%`,
  border: `2px dashed ${color}`,
  borderRadius: 4,
});

const band = (edge: 'top' | 'bottom', share: number): CSSProperties => ({
  position: 'absolute',
  left: 0,
  right: 0,
  [edge]: 0,
  height: `${share * 100}%`,
  backgroundColor: 'rgba(239, 68, 68, 0.18)',
  borderTop: edge === 'bottom' ? '2px solid rgba(239, 68, 68, 0.7)' : undefined,
  borderBottom: edge === 'top' ? '2px solid rgba(239, 68, 68, 0.7)' : undefined,
});

export const SafeArea: FC<{ timeline: Timeline }> = ({ timeline }) => {
  const vertical = timeline.height > timeline.width;
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {vertical && (
        <>
          <div style={band('top', REELS_TOP_SHARE)} />
          <div style={band('bottom', REELS_BOTTOM_SHARE)} />
        </>
      )}
      <div style={frame(5, 'rgba(255, 255, 255, 0.85)')} />
      <div style={frame(10, 'rgba(250, 204, 21, 0.9)')} />
    </div>
  );
};
