import type { OutputSettings } from '../model/output';

const SHORT_SIDE: Record<OutputSettings['resolution'], number> = {
  '720p': 720,
  '1080p': 1080,
  '1440p': 1440,
  '2160p': 2160,
};

const RATIO: Record<OutputSettings['aspect'], [width: number, height: number]> = {
  '16:9': [16, 9],
  '9:16': [9, 16],
  '1:1': [1, 1],
  '4:5': [4, 5],
};

/**
 * Pixel size of the video. The resolution names the short side, as on phones and in Premiere:
 * 1080p is 1920 × 1080 in landscape and 1080 × 1920 for a 9:16 reel. Sides are even, which
 * H.264 with 4:2:0 chroma requires.
 */
export function outputSize(output: Pick<OutputSettings, 'aspect' | 'resolution'>): {
  width: number;
  height: number;
} {
  const short = SHORT_SIDE[output.resolution];
  const [w, h] = RATIO[output.aspect];
  const even = (value: number) => Math.round(value / 2) * 2;
  return w >= h
    ? { width: even((short * w) / h), height: short }
    : { width: short, height: even((short * h) / w) };
}
