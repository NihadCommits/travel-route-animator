import { describe, expect, it } from 'vitest';
import { formatClock, isTimeZone, localDateTimeOf, zonedTimeToEpochMs, zoneOffsetMs } from './zone';

const HOUR = 3600_000;

describe('zonedTimeToEpochMs', () => {
  it('reads a local time in its own zone, summer and winter', () => {
    expect(zonedTimeToEpochMs('2026-07-14T08:30', 'Europe/Vienna')).toBe(
      Date.UTC(2026, 6, 14, 6, 30),
    );
    expect(zonedTimeToEpochMs('2026-01-14T08:30', 'Europe/Vienna')).toBe(
      Date.UTC(2026, 0, 14, 7, 30),
    );
    expect(zonedTimeToEpochMs('2026-07-14T08:30', 'America/New_York')).toBe(
      Date.UTC(2026, 6, 14, 12, 30),
    );
  });

  it('gets the morning after the clocks went forward right', () => {
    // Vienna, 29 March 2026: 02:00 became 03:00.
    expect(zonedTimeToEpochMs('2026-03-29T03:30', 'Europe/Vienna')).toBe(
      Date.UTC(2026, 2, 29, 1, 30),
    );
    expect(zonedTimeToEpochMs('2026-03-29T01:30', 'Europe/Vienna')).toBe(
      Date.UTC(2026, 2, 29, 0, 30),
    );
  });

  it('refuses what is not a local date and time', () => {
    expect(() => zonedTimeToEpochMs('14.07.2026 08:30', 'Europe/Vienna')).toThrow();
  });
});

describe('zone helpers', () => {
  it('knows the offset and turns an instant back into local time', () => {
    const summer = Date.UTC(2026, 6, 14, 6, 30);
    expect(zoneOffsetMs(summer, 'Europe/Vienna')).toBe(2 * HOUR);
    expect(zoneOffsetMs(summer, 'Asia/Kolkata')).toBe(5.5 * HOUR);
    expect(localDateTimeOf(summer, 'Europe/Vienna')).toBe('2026-07-14T08:30');
    expect(localDateTimeOf(summer, 'Europe/Lisbon')).toBe('2026-07-14T07:30');
  });

  it('formats the clock in the zone, with or without the date', () => {
    const at = Date.UTC(2026, 6, 14, 22, 5);
    expect(formatClock(at, 'Europe/Vienna')).toBe('00:05');
    const withDate = formatClock(at, 'Europe/Vienna', true);
    expect(withDate).toContain('15.07.2026');
    expect(withDate).toContain('00:05');
  });

  it('tells known time zones from made-up ones', () => {
    expect(isTimeZone('Europe/Vienna')).toBe(true);
    expect(isTimeZone('UTC')).toBe(true);
    expect(isTimeZone('Mars/Olympus_Mons')).toBe(false);
  });
});
