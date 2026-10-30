import type { VideoInfo } from '@travel-route-animator/core';

const number = (value: number, digits: number) =>
  value.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** "45 s", "3:07 min", "1:02:05 h": how long a render takes or took. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total} s`;
  const seconds = String(total % 60).padStart(2, '0');
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}:${seconds} min`;
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${seconds} h`;
}

/** "1920 × 1080 · 25 fps · 12,0 s": what the finished file is, as read back from it. */
export function formatVideo({ width, height, fps, durationSec }: VideoInfo): string {
  const rate = fps === null ? '' : ` · ${number(fps, Number.isInteger(fps) ? 0 : 2)} fps`;
  return `${width} × ${height}${rate} · ${number(durationSec, 1)} s`;
}
