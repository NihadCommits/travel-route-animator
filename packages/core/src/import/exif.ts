import type { LngLat } from '../geo/lngLat';

// Where a photo was taken, from its EXIF data (M14, ADR 0014). A JPEG keeps EXIF in its APP1
// segment as a small TIFF file: a byte order mark, then directories (IFDs) of 12-byte entries.
// IFD0 points to the GPS directory (tag 0x8825), which holds latitude and longitude as three
// fractions each (degrees, minutes, seconds) and a reference letter (N/S, E/W).

export interface PhotoPlace {
  lngLat?: LngLat;
  /** When it was taken, "2026:07:04 10:15:00" as the camera writes it. */
  takenAt?: string;
}

const GPS_IFD = 0x8825;
const EXIF_IFD = 0x8769;
const DATE_TIME_ORIGINAL = 0x9003;
const GPS_LATITUDE_REF = 1;
const GPS_LATITUDE = 2;
const GPS_LONGITUDE_REF = 3;
const GPS_LONGITUDE = 4;

/** The TIFF block inside a JPEG's EXIF segment, or undefined if there is none. */
function exifBlock(bytes: Uint8Array): DataView | undefined {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  let pos = 2;
  while (pos + 4 <= bytes.length) {
    if (bytes[pos] !== 0xff) return undefined;
    const marker = bytes[pos + 1]!;
    // Start of the picture data: no metadata after this.
    if (marker === 0xda) return undefined;
    const length = (bytes[pos + 2]! << 8) | bytes[pos + 3]!;
    const start = pos + 4;
    const isExif =
      marker === 0xe1 &&
      String.fromCharCode(...bytes.subarray(start, start + 4)) === 'Exif' &&
      bytes[start + 4] === 0 &&
      bytes[start + 5] === 0;
    if (isExif) {
      return new DataView(bytes.buffer, bytes.byteOffset + start + 6, length - 8);
    }
    pos += 2 + length;
  }
  return undefined;
}

interface Entry {
  tag: number;
  type: number;
  count: number;
  /** Where the value is: inside the entry when it fits in four bytes, else at an offset. */
  valueOffset: number;
}

function readIfd(tiff: DataView, offset: number, little: boolean): Entry[] {
  if (offset + 2 > tiff.byteLength) return [];
  const count = tiff.getUint16(offset, little);
  const entries: Entry[] = [];
  for (let i = 0; i < count; i++) {
    const at = offset + 2 + i * 12;
    if (at + 12 > tiff.byteLength) break;
    const type = tiff.getUint16(at + 2, little);
    const n = tiff.getUint32(at + 4, little);
    const size = n * ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }[type] ?? 1);
    entries.push({
      tag: tiff.getUint16(at, little),
      type,
      count: n,
      valueOffset: size <= 4 ? at + 8 : tiff.getUint32(at + 8, little),
    });
  }
  return entries;
}

function ascii(tiff: DataView, entry: Entry): string {
  let text = '';
  for (let i = 0; i < entry.count && entry.valueOffset + i < tiff.byteLength; i++) {
    const code = tiff.getUint8(entry.valueOffset + i);
    if (code === 0) break;
    text += String.fromCharCode(code);
  }
  return text;
}

/** Degrees from three RATIONALs: degrees, minutes, seconds. */
function degrees(tiff: DataView, entry: Entry, little: boolean): number | undefined {
  if (entry.type !== 5 || entry.count < 3 || entry.valueOffset + 24 > tiff.byteLength) {
    return undefined;
  }
  const part = (i: number) => {
    const numerator = tiff.getUint32(entry.valueOffset + i * 8, little);
    const denominator = tiff.getUint32(entry.valueOffset + i * 8 + 4, little);
    return denominator === 0 ? 0 : numerator / denominator;
  };
  return part(0) + part(1) / 60 + part(2) / 3600;
}

/** Where and when a JPEG photo was taken, as far as its EXIF data says. */
export function readPhotoPlace(bytes: Uint8Array): PhotoPlace {
  const tiff = exifBlock(bytes);
  if (!tiff || tiff.byteLength < 8) return {};
  const order = tiff.getUint16(0);
  if (order !== 0x4949 && order !== 0x4d4d) return {};
  const little = order === 0x4949;
  const ifd0 = readIfd(tiff, tiff.getUint32(4, little), little);
  const pointer = (tag: number) => {
    const entry = ifd0.find((e) => e.tag === tag);
    return entry ? tiff.getUint32(entry.valueOffset, little) : undefined;
  };

  const place: PhotoPlace = {};
  const exifOffset = pointer(EXIF_IFD);
  if (exifOffset !== undefined) {
    const taken = readIfd(tiff, exifOffset, little).find((e) => e.tag === DATE_TIME_ORIGINAL);
    if (taken) place.takenAt = ascii(tiff, taken);
  }
  const gpsOffset = pointer(GPS_IFD);
  if (gpsOffset === undefined) return place;
  const gps = readIfd(tiff, gpsOffset, little);
  const find = (tag: number) => gps.find((e) => e.tag === tag);
  const latEntry = find(GPS_LATITUDE);
  const lngEntry = find(GPS_LONGITUDE);
  if (!latEntry || !lngEntry) return place;
  const lat = degrees(tiff, latEntry, little);
  const lng = degrees(tiff, lngEntry, little);
  if (lat === undefined || lng === undefined) return place;
  const latRef = find(GPS_LATITUDE_REF);
  const lngRef = find(GPS_LONGITUDE_REF);
  const south = latRef ? ascii(tiff, latRef) === 'S' : false;
  const west = lngRef ? ascii(tiff, lngRef) === 'W' : false;
  // Many phones write 0/0 when they had no fix; that is no place.
  if (lat === 0 && lng === 0) return place;
  place.lngLat = [west ? -lng : lng, south ? -lat : lat];
  return place;
}
