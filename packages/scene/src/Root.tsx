import type { FC } from 'react';
import { Composition } from 'remotion';
import { SpikeMap } from './spike/SpikeMap';

const FPS = 30;
const LINE_BUILD_SECONDS = 6;

export const RemotionRoot: FC = () => (
  <>
    <Composition
      id="SpikeFlat"
      component={SpikeMap}
      width={1920}
      height={1080}
      fps={FPS}
      durationInFrames={FPS * LINE_BUILD_SECONDS}
      defaultProps={{ projection: 'mercator' as const }}
    />
    <Composition
      id="SpikeGlobe"
      component={SpikeMap}
      width={1920}
      height={1080}
      fps={FPS}
      durationInFrames={FPS * LINE_BUILD_SECONDS}
      defaultProps={{ projection: 'globe' as const }}
    />
  </>
);
