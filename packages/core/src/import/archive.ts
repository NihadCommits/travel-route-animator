import { isFit, parseFit } from './fit';
import { ImportError, parseTrackFile, type ImportedTrackData } from './parse';

// Files as they come out of Garmin Connect and Strava (M16): "Export Original" hands out a ZIP
// with the FIT file inside, Strava's full archive gzipped FIT files. The containers are read
// here; unpacking compressed data is left to the caller (the editor uses the browser's
// DecompressionStream), so this stays plain code without a runtime of its own.

/** A file in a ZIP archive: stored as is (method 0) or deflated (method 8). */
export interface ZipEntry {
  name: string;
  method: number;
  data: Uint8Array;
}

/** Where a track can be inside an archive. */
export const TRACK_FILE = /\.(gpx|tcx|fit|srt)$/i;

/**
 * The files of a ZIP archive, read from its central directory (the list at the end, which
 * holds the sizes even when the local headers do not).
 */
export function zipEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end-of-central-directory record: signature 0x06054b50, within the last 64 KB.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ImportError('This is not a ZIP file');
  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new ImportError('The ZIP file is damaged');
    const method = view.getUint16(at + 10, true);
    const compressedSize = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const localHeader = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    // The data starts after the local header, whose name and extra field may differ in length.
    const localName = view.getUint16(localHeader + 26, true);
    const localExtra = view.getUint16(localHeader + 28, true);
    const start = localHeader + 30 + localName + localExtra;
    entries.push({ name, method, data: bytes.subarray(start, start + compressedSize) });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** Whether the bytes are a gzip stream (1F 8B). */
export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

/** Whether the bytes are a ZIP archive (PK\3\4). */
export function isZip(bytes: Uint8Array): boolean {
  return (
    bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4
  );
}

/**
 * Any track file as bytes: FIT by its header, the rest as text (GPX, TCX, DJI subtitles).
 * Archives must be unpacked first (unpackTrackFile).
 */
export function parseTrackBytes(bytes: Uint8Array, fileName: string): ImportedTrackData {
  if (isFit(bytes)) return parseFit(bytes, fileName);
  if (isZip(bytes) || isGzip(bytes)) throw new ImportError('Unpack the archive first');
  return parseTrackFile(new TextDecoder().decode(bytes), fileName);
}

/** Inflates raw deflate data (ZIP) or a gzip stream; the editor passes DecompressionStream. */
export interface Unpacker {
  inflateRaw: (data: Uint8Array) => Promise<Uint8Array>;
  gunzip: (data: Uint8Array) => Promise<Uint8Array>;
}

/**
 * The track file inside what the user picked: the file itself, the first track in a ZIP, or
 * the content of a gzipped file (".fit.gz" in Strava's archive).
 */
export async function unpackTrackFile(
  bytes: Uint8Array,
  fileName: string,
  unpacker: Unpacker,
): Promise<{ bytes: Uint8Array; fileName: string }> {
  if (isGzip(bytes)) {
    return { bytes: await unpacker.gunzip(bytes), fileName: fileName.replace(/\.gz$/i, '') };
  }
  if (!isZip(bytes)) return { bytes, fileName };
  const entry = zipEntries(bytes).find((each) => TRACK_FILE.test(each.name));
  if (!entry) throw new ImportError('The ZIP file holds no GPX, TCX, FIT or SRT file');
  const name = entry.name.split('/').at(-1)!;
  if (entry.method === 0) return { bytes: entry.data, fileName: name };
  if (entry.method === 8) return { bytes: await unpacker.inflateRaw(entry.data), fileName: name };
  throw new ImportError(
    `The ZIP file uses a packing method this tool cannot read (${entry.method})`,
  );
}
