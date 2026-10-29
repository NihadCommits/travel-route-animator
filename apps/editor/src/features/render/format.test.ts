import { describe, expect, it } from 'vitest';
import { formatDuration, formatVideo } from './format';

describe('formatDuration', () => {
  it('writes seconds, minutes and hours as a video person reads them', () => {
    expect(formatDuration(44_600)).toBe('45 s');
    expect(formatDuration(187_000)).toBe('3:07 min');
    expect(formatDuration(3_725_000)).toBe('1:02:05 h');
    expect(formatDuration(-5)).toBe('0 s');
  });
});

describe('formatVideo', () => {
  it('names size, frame rate and length the German way', () => {
    expect(formatVideo({ width: 1920, height: 1080, fps: 25, durationSec: 12.04 })).toBe(
      '1920 × 1080 · 25 fps · 12,0 s',
    );
    expect(formatVideo({ width: 1080, height: 1920, fps: 29.97, durationSec: 3 })).toBe(
      '1080 × 1920 · 29,97 fps · 3,0 s',
    );
    expect(formatVideo({ width: 640, height: 360, fps: null, durationSec: 0.04 })).toBe(
      '640 × 360 · 0,0 s',
    );
  });
});
