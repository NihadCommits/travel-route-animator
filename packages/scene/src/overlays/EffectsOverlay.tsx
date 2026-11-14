import type { FrameState } from '@travel-route-animator/core';
import type { FC } from 'react';
import { AbsoluteFill } from 'remotion';

// White and black over the whole picture, by the frame's numbers (M11: the end of a dive-in;
// M10: the dip between chained stages). Plain colours, no transitions: every frame on its own.

/** How dark the picture gets: a fade to black (M11) or the dip between stages (M10). */
export function blackOf(effects: FrameState['effects'], dip = 0): number {
  return Math.max(effects.fade, dip);
}

/**
 * `transparent`: an overlay for footage (ADR 0013) fades out instead of to black, so the
 * footage below shows through; the composition makes its content transparent then.
 */
export const EffectsOverlay: FC<{
  effects: FrameState['effects'];
  dip?: number;
  transparent?: boolean;
}> = ({ effects, dip = 0, transparent = false }) => {
  const black = transparent ? 0 : blackOf(effects, dip);
  return (
    <>
      {effects.flash > 0 && (
        <AbsoluteFill style={{ backgroundColor: '#ffffff', opacity: effects.flash }} />
      )}
      {black > 0 && <AbsoluteFill style={{ backgroundColor: '#000000', opacity: black }} />}
    </>
  );
};
