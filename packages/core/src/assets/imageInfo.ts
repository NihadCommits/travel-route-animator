import { IMAGE_LIMITS, type ImageMimeType } from '../model/assets';

// Reads what an uploaded image is from its first bytes, the way a browser would, and never
// trusts the file name or the content type it came with (ADR 0009). Only the headers are
// read; decoding the pictures is the browser's job.

export interface ImageInfo {
  mimeType: ImageMimeType;
  widthPx: number;
  heightPx: number;
  frameCount: number;
}

export type ImageProblem =
  'image.unsupported' | 'image.broken' | 'image.tooLarge' | 'image.tooWide' | 'image.tooManyFrames';

export type ImageCheck =
  | { ok: true; info: ImageInfo }
  | { ok: false; problem: ImageProblem; values: Record<string, number> };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((byte, i) => bytes[i] === byte);
}

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

function readPng(bytes: Uint8Array): ImageInfo | 'broken' {
  // The first chunk is always IHDR: its length, its name, then width and height (big-endian).
  if (bytes.length < 24 || !startsWith(bytes.subarray(12), ascii('IHDR'))) return 'broken';
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const widthPx = view.getUint32(16);
  const heightPx = view.getUint32(20);
  if (widthPx === 0 || heightPx === 0) return 'broken';
  // An animated PNG is drawn as its first picture, like any still image.
  return { mimeType: 'image/png', widthPx, heightPx, frameCount: 1 };
}

/** The size in bytes of a colour table, from the packed field that announces it. */
const colourTable = (packed: number) => (packed & 0x80 ? 3 * 2 ** ((packed & 0x07) + 1) : 0);

/**
 * Walks the blocks of a GIF and counts its pictures. Data comes in sub-blocks, each led by its
 * length, until an empty one; skipping them is all it takes to get from picture to picture.
 */
function readGif(bytes: Uint8Array): ImageInfo | 'broken' {
  if (bytes.length < 13) return 'broken';
  const widthPx = bytes[6]! | (bytes[7]! << 8);
  const heightPx = bytes[8]! | (bytes[9]! << 8);
  if (widthPx === 0 || heightPx === 0) return 'broken';

  let pos = 13 + colourTable(bytes[10]!);
  let frameCount = 0;
  const skipSubBlocks = () => {
    while (pos < bytes.length) {
      const size = bytes[pos]!;
      pos += 1 + size;
      if (size === 0) return true;
    }
    return false;
  };

  while (pos < bytes.length) {
    const block = bytes[pos];
    if (block === 0x3b) break;
    if (block === 0x21) {
      // Extension: an introducer, a label, then sub-blocks.
      pos += 2;
      if (!skipSubBlocks()) return 'broken';
    } else if (block === 0x2c) {
      // Image descriptor: ten bytes, maybe a local colour table, the LZW code size, the data.
      if (pos + 10 > bytes.length) return 'broken';
      pos += 10 + colourTable(bytes[pos + 9]!) + 1;
      if (!skipSubBlocks()) return 'broken';
      frameCount += 1;
    } else {
      return 'broken';
    }
  }
  // A missing trailer is common and browsers forgive it; a GIF without a picture is not one.
  return frameCount > 0 ? { mimeType: 'image/gif', widthPx, heightPx, frameCount } : 'broken';
}

export function readImageInfo(bytes: Uint8Array): ImageInfo | 'unsupported' | 'broken' {
  if (startsWith(bytes, PNG_SIGNATURE)) return readPng(bytes);
  if (startsWith(bytes, ascii('GIF87a')) || startsWith(bytes, ascii('GIF89a'))) {
    return readGif(bytes);
  }
  return 'unsupported';
}

/** Whether an image may become a vehicle icon: PNG or GIF, and within IMAGE_LIMITS. */
export function checkImage(bytes: Uint8Array): ImageCheck {
  if (bytes.length > IMAGE_LIMITS.bytes) {
    return {
      ok: false,
      problem: 'image.tooLarge',
      values: { bytes: bytes.length, limit: IMAGE_LIMITS.bytes },
    };
  }
  const info = readImageInfo(bytes);
  if (info === 'unsupported') return { ok: false, problem: 'image.unsupported', values: {} };
  if (info === 'broken') return { ok: false, problem: 'image.broken', values: {} };
  const { widthPx, heightPx, frameCount } = info;
  if (Math.max(widthPx, heightPx) > IMAGE_LIMITS.sidePx) {
    return {
      ok: false,
      problem: 'image.tooWide',
      values: { widthPx, heightPx, limit: IMAGE_LIMITS.sidePx },
    };
  }
  if (frameCount > IMAGE_LIMITS.frames) {
    return {
      ok: false,
      problem: 'image.tooManyFrames',
      values: { frames: frameCount, limit: IMAGE_LIMITS.frames },
    };
  }
  return { ok: true, info };
}
