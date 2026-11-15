// Time of day at a place (M16): a stage's clock runs in that stage's time zone, whatever the
// computer's own zone is. Only Intl, which gives the same answers in Node and in Chrome, so a
// frame shows the same time in the preview and in the export.

/** Whether the runtime knows this IANA time zone, e.g. "Europe/Vienna". */
export function isTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

const partsFormat = new Map<string, Intl.DateTimeFormat>();

/** The wall clock in `timeZone` at an instant, as if that were UTC: the zone's offset is the difference. */
function wallClockAsUtc(epochMs: number, timeZone: string): number {
  let format = partsFormat.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsFormat.set(timeZone, format);
  }
  const parts = format.formatToParts(new Date(epochMs));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
}

/** How far `timeZone` is ahead of UTC at an instant, in milliseconds (+2 h in a Viennese summer). */
export function zoneOffsetMs(epochMs: number, timeZone: string): number {
  const whole = Math.floor(epochMs / 1000) * 1000;
  return wallClockAsUtc(whole, timeZone) - whole;
}

/**
 * A local date and time ("2026-07-14T08:30") in `timeZone` as milliseconds since 1970. The
 * offset is looked up twice, at the first guess and at the corrected time, which gets the
 * hours around a change to or from summer time right.
 */
export function zonedTimeToEpochMs(local: string, timeZone: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!match) throw new Error(`Not a local date and time: "${local}"`);
  const [, y, mo, d, h, mi] = match.map(Number) as [number, number, number, number, number, number];
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  const first = asUtc - zoneOffsetMs(asUtc, timeZone);
  return asUtc - zoneOffsetMs(first, timeZone);
}

/** The local date and time at an instant, in the form the clock's departure field uses. */
export function localDateTimeOf(epochMs: number, timeZone: string): string {
  return new Date(wallClockAsUtc(epochMs, timeZone)).toISOString().slice(0, 16);
}

const clockFormats = new Map<string, Intl.DateTimeFormat>();

function clockFormat(timeZone: string, withDate: boolean): Intl.DateTimeFormat {
  const key = `${timeZone}|${withDate}`;
  let format = clockFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat('de-AT', {
      timeZone,
      hourCycle: 'h23',
      hour: '2-digit',
      minute: '2-digit',
      ...(withDate && { day: '2-digit', month: '2-digit', year: 'numeric' }),
    });
    clockFormats.set(key, format);
  }
  return format;
}

/** "08:47", or "14.07.2026, 08:47" with the date. */
export function formatClock(epochMs: number, timeZone: string, withDate = false): string {
  return clockFormat(timeZone, withDate).format(new Date(epochMs));
}
