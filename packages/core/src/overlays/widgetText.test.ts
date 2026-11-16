import { describe, expect, it } from 'vitest';
import type { Widget } from '../model/overlays';
import { formatClimb, formatDistance, formatHeight, formatSpeed, widgetText } from './widgetText';

const block = (kind: Widget['kind'], extra: Partial<Widget> = {}): Widget => ({
  id: `w_${kind}`,
  kind,
  anchor: 'bottom-left',
  dx: 48,
  dy: 44,
  scale: 1,
  transition: 'none',
  ...extra,
});

const state = {
  counters: {
    distanceKm: 12.345,
    travelSec: 5400,
    speedKmh: 18.4,
    heartRateBpm: 142,
    cadenceRpm: 84,
    clockMs: Date.UTC(2026, 6, 14, 22, 5),
    progress: 0.256,
    place: 'Gipfelrast',
  },
  elevation: { trackId: 't', atM: 100, elevationM: 1770.4, gainM: 1246, lossM: 33 },
};
const context = { units: 'metric' as const, timeZone: 'Europe/Vienna' };

describe('units', () => {
  // Thousands are grouped with a narrow no-break space, as Austrian German writes them.
  it('writes metric and imperial values the Austrian way', () => {
    expect(formatDistance(1113.4, 'metric')).toMatch(/^1\s113 km$/);
    expect(formatDistance(12.345, 'metric', 1)).toBe('12,3 km');
    expect(formatDistance(16.09344, 'imperial')).toBe('10 mi');
    expect(formatSpeed(100, 'imperial')).toBe('62 mph');
    expect(formatHeight(1000, 'imperial')).toMatch(/^3\s281 ft$/);
    expect(formatClimb(1246, 33, 'metric')).toMatch(/^↑ 1\s246 m {3}↓ 33 m$/);
  });
});

describe('widgetText', () => {
  it('says what each block shows in this frame', () => {
    const text = (kind: Widget['kind'], extra?: Partial<Widget>) =>
      widgetText(block(kind, extra), state, context);
    expect(text('distance')).toBe('12 km');
    expect(text('distance', { decimals: 1, unit: 'imperial' })).toBe('7,7 mi');
    expect(text('travelTime')).toBe('1:30 h');
    expect(text('speed')).toBe('18 km/h');
    expect(text('heartRate')).toBe('♥ 142');
    expect(text('cadence')).toBe('84 /min');
    expect(text('climb')).toMatch(/^↑ 1\s246 m {3}↓ 33 m$/);
    expect(text('altitude')).toMatch(/^1\s770 m$/);
    // 22:05 UTC is the next day in Vienna.
    expect(text('clock')).toBe('00:05');
    expect(text('date')).toBe('15.07.2026');
    expect(text('place')).toBe('Gipfelrast');
    expect(text('progress')).toBe('26 %');
    expect(text('text', { text: 'Tag 4' })).toBe('Tag 4');
    expect(text('elevationProfile')).toBeUndefined();
  });

  it('shows nothing where the frame has no value', () => {
    const bare = { counters: {}, elevation: undefined };
    for (const kind of ['distance', 'heartRate', 'climb', 'clock', 'place'] as const) {
      expect(widgetText(block(kind), bare, context)).toBeUndefined();
    }
    expect(widgetText(block('clock'), state, { ...context, timeZone: undefined })).toBeUndefined();
  });
});
