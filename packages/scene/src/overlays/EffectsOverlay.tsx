import type { FrameState } from '@travel-route-animator/core';
import type { FC } from 'react';
import { AbsoluteFill } from 'remotion';

// White and black over the whole picture, by the frame's numbers (M11: the end of a dive-in;
// M10: the dip between chained stages). Plain colours, no transitions: every frame on its own.

export const EffectsOverlay: FC<{ effects: FrameState['effects']; dip?: number }> = ({
  effects,
  dip = 0,
}) => {
  const black = Math.max(effects.fade, dip);
  return (
    <>
      {effects.flash > 0 && (
        <AbsoluteFill style={{ backgroundColor: '#ffffff', opacity: effects.flash }} />
      )}
      {black > 0 && <AbsoluteFill style={{ backgroundColor: '#000000', opacity: black }} />}
    </>
  );
};
