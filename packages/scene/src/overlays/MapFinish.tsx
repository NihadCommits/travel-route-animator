import type { ThemeExtras } from '@travel-route-animator/core';
import type { FC } from 'react';
import { AbsoluteFill } from 'remotion';

// A theme's finish over the map, as HTML so preview and export match (ADR 0010): paper grain
// and darker corners. Both are static; the noise has a fixed seed, so every frame is the same.

/** Brown-grey grain with alpha from the noise: multiplied over the map, it reads as paper. */
const GRAIN = '0 0 0 0 0.45  0 0 0 0 0.36  0 0 0 0 0.22  0 0 0 0.55 0';

export const MapFinish: FC<{ extras: ThemeExtras }> = ({ extras }) => {
  const { texture, vignette } = extras;
  if (texture === 'none' && vignette === 0) return null;
  const corner = (vignette * 0.65).toFixed(3);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {texture === 'paper' && (
        <svg width="100%" height="100%" style={{ position: 'absolute', mixBlendMode: 'multiply' }}>
          <filter id="paper-grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={3} seed={7} />
            <feColorMatrix type="matrix" values={GRAIN} />
          </filter>
          <rect width="100%" height="100%" filter="url(#paper-grain)" opacity={0.35} />
        </svg>
      )}
      {vignette > 0 && (
        <AbsoluteFill
          style={{
            background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,${corner}) 100%)`,
          }}
        />
      )}
    </AbsoluteFill>
  );
};
