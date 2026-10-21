import { describe, expect, it } from 'vitest';
import { HexColorSchema, IsoDateTimeSchema, LngLatSchema } from './primitives';

describe('LngLatSchema', () => {
  it('accepts coordinates in [lng, lat] order', () => {
    expect(LngLatSchema.parse([16.3755, 48.1851])).toEqual([16.3755, 48.1851]);
    expect(LngLatSchema.parse([-180, -90])).toEqual([-180, -90]);
  });

  it('points at a swapped [lat, lng] pair', () => {
    // Tokyo written as [lat, lng]. (Vienna swapped would still be in range and go unnoticed;
    // only the explicit LngLat type protects against that.)
    const result = LngLatSchema.safeParse([35.6762, 139.6503]);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/Latitude 139\.6503 is out of range/);
    expect(result.error?.issues[0]?.message).toMatch(/Looks like \[lat, lng\]/);
    expect(result.error?.issues[0]?.path).toEqual([1]);
  });

  it('reports a longitude out of range without the swap hint', () => {
    const result = LngLatSchema.safeParse([200, 10]);
    expect(result.error?.issues).toHaveLength(1);
    expect(result.error?.issues[0]?.message).toBe('Longitude 200 is out of range (-180 to 180)');
  });

  it('rejects anything that is not a pair of numbers', () => {
    expect(LngLatSchema.safeParse([1]).success).toBe(false);
    expect(LngLatSchema.safeParse(['16', '48']).success).toBe(false);
  });
});

describe('HexColorSchema', () => {
  it('accepts short and long hex colors', () => {
    expect(HexColorSchema.safeParse('#E4572E').success).toBe(true);
    expect(HexColorSchema.safeParse('#fff').success).toBe(true);
  });

  it('rejects color names and missing hashes', () => {
    expect(HexColorSchema.safeParse('red').success).toBe(false);
    expect(HexColorSchema.safeParse('E4572E').success).toBe(false);
  });
});

describe('IsoDateTimeSchema', () => {
  it('accepts ISO 8601 timestamps with Z or an offset', () => {
    expect(IsoDateTimeSchema.safeParse('2026-10-21T08:30:00.000Z').success).toBe(true);
    expect(IsoDateTimeSchema.safeParse('2026-10-21T10:30:00+02:00').success).toBe(true);
  });

  it('rejects plain dates', () => {
    expect(IsoDateTimeSchema.safeParse('2026-10-21').success).toBe(false);
  });
});
