import type { LngLat } from '../geo/lngLat';

// Reading tracks from files (M14, ADR 0014): GPX from bike computers, watches and apps, and
// the subtitle files (SRT) DJI drones write next to each video. Plain text parsing without a
// DOM, so the same code runs in the editor and in Node.

export interface ImportPoint {
  lngLat: LngLat;
  /** Metres above sea level (GPX `ele`, DJI `abs_alt`). */
  ele?: number;
  /** Milliseconds: since 1970 for GPX, since the start of the video for DJI. */
  time?: number;
}

export interface ImportedTrackData {
  source: 'gpx' | 'dji-srt';
  /** The track's name in the file, else the file name. */
  name: string;
  points: ImportPoint[];
  /** Named points of a GPX file (`wpt`), candidates for stops. */
  waypoints: { lngLat: LngLat; name: string }[];
  /** What the file says the activity was (GPX `type`, e.g. "cycling"). */
  activity?: string;
}

export class ImportError extends Error {
  override name = 'ImportError';
}

const unescapeXml = (text: string) =>
  text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();

/** The text of the first <tag> inside `xml`, with or without a namespace prefix. */
function childText(xml: string, tag: string): string | undefined {
  const match = new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`).exec(xml);
  return match ? unescapeXml(match[1]!) : undefined;
}

function attribute(tag: string, name: string): number | undefined {
  const match = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`).exec(tag);
  const value = match ? Number(match[1]) : Number.NaN;
  return Number.isFinite(value) ? value : undefined;
}

/** Every <tag …>…</tag> or <tag …/> element of a kind, as its opening tag and its content. */
function* elements(xml: string, tag: string): Generator<{ open: string; body: string }> {
  const pattern = new RegExp(
    `<(?:\\w+:)?${tag}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</(?:\\w+:)?${tag}>)`,
    'g',
  );
  for (const match of xml.matchAll(pattern)) yield { open: match[1]!, body: match[2] ?? '' };
}

function pointOf(open: string, body: string): ImportPoint | undefined {
  const lat = attribute(open, 'lat');
  const lon = attribute(open, 'lon');
  if (lat === undefined || lon === undefined || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return undefined;
  }
  const eleText = childText(body, 'ele');
  const ele = eleText ? Number(eleText) : Number.NaN;
  const time = Date.parse(childText(body, 'time') ?? '');
  return {
    lngLat: [lon, lat],
    ...(Number.isFinite(ele) && { ele }),
    ...(Number.isFinite(time) && { time }),
  };
}

/**
 * The points of a GPX file: every track (`trk`) with all its segments in order, or the route
 * (`rte`) if there is no track. Named waypoints (`wpt`) come along as stop candidates.
 */
export function parseGpx(text: string, fileName: string): ImportedTrackData {
  if (!/<(?:\w+:)?gpx\b/.test(text)) throw new ImportError('This is not a GPX file');
  const points: ImportPoint[] = [];
  let name: string | undefined;
  let activity: string | undefined;
  for (const { body } of elements(text, 'trk')) {
    name ??= childText(body.replace(/<(?:\w+:)?trkseg[\s\S]*/, ''), 'name');
    activity ??= childText(body.replace(/<(?:\w+:)?trkseg[\s\S]*/, ''), 'type');
    for (const point of elements(body, 'trkpt')) {
      const parsed = pointOf(point.open, point.body);
      if (parsed) points.push(parsed);
    }
  }
  if (points.length === 0) {
    for (const { body } of elements(text, 'rte')) {
      name ??= childText(body.replace(/<(?:\w+:)?rtept[\s\S]*/, ''), 'name');
      for (const point of elements(body, 'rtept')) {
        const parsed = pointOf(point.open, point.body);
        if (parsed) points.push(parsed);
      }
    }
  }
  if (points.length < 2) throw new ImportError('The GPX file holds no track with two points');
  const waypoints = [...elements(text, 'wpt')].flatMap(({ open, body }) => {
    const point = pointOf(open, body);
    const label = childText(body, 'name');
    return point && label ? [{ lngLat: point.lngLat, name: label }] : [];
  });
  return {
    source: 'gpx',
    name: name || fileName.replace(/\.gpx$/i, ''),
    points,
    waypoints,
    ...(activity && { activity }),
  };
}

/** "00:01:02,500" as milliseconds. */
function srtTime(text: string): number | undefined {
  const match = /(\d+):(\d+):(\d+)[,.](\d+)/.exec(text);
  if (!match) return undefined;
  const [, h, m, s, ms] = match.map(Number) as [number, number, number, number, number];
  return ((h * 60 + m) * 60 + s) * 1000 + ms;
}

function number(text: string, pattern: RegExp): number | undefined {
  const match = pattern.exec(text);
  const value = match ? Number(match[1]) : Number.NaN;
  return Number.isFinite(value) ? value : undefined;
}

/**
 * The GPS of a DJI drone's subtitle file. Newer drones write
 * `[latitude: 47.80] [longitude: 13.04] [rel_alt: 50.3 abs_alt: 600.2]`, older ones
 * `GPS(13.04,47.80,19)` with the longitude first. Frames without a GPS fix (0, 0) are left out.
 */
export function parseDjiSrt(text: string, fileName: string): ImportedTrackData {
  const points: ImportPoint[] = [];
  for (const block of text.replace(/\r/g, '').split(/\n\s*\n/)) {
    const time = srtTime(block);
    let lat = number(block, /\[\s*latitude\s*:\s*(-?[\d.]+)/i);
    // Some firmware writes "longtitude".
    let lng = number(block, /\[\s*long(?:i|ti)tude\s*:\s*(-?[\d.]+)/i);
    const old = /GPS\s*\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/.exec(block);
    if ((lat === undefined || lng === undefined) && old) {
      lng = Number(old[1]);
      lat = Number(old[2]);
    }
    if (lat === undefined || lng === undefined) continue;
    if (Math.abs(lat) < 1e-6 && Math.abs(lng) < 1e-6) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const ele = number(block, /abs_alt\s*:\s*(-?[\d.]+)/i);
    points.push({
      lngLat: [lng, lat],
      ...(ele !== undefined && { ele }),
      ...(time !== undefined && { time }),
    });
  }
  if (points.length < 2) {
    throw new ImportError('The subtitle file holds no GPS positions (is it from a DJI drone?)');
  }
  return { source: 'dji-srt', name: fileName.replace(/\.srt$/i, ''), points, waypoints: [] };
}

/** GPX or DJI subtitles, by the file's name and content. */
export function parseTrackFile(text: string, fileName: string): ImportedTrackData {
  if (/\.srt$/i.test(fileName) || /-->/.test(text.slice(0, 2000)))
    return parseDjiSrt(text, fileName);
  return parseGpx(text, fileName);
}
