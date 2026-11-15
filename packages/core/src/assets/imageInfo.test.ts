import { describe, expect, it } from 'vitest';
import { assetFileName, IMAGE_LIMITS } from '../model/assets';
import { checkImage, readImageInfo } from './imageInfo';

// Tiny images built byte by byte: only the headers matter here, not the pixels.

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16le = (n: number) => [n & 255, (n >> 8) & 255];

function png(width: number, height: number, padTo = 0): Uint8Array {
  const bytes = [
    ...[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    ...u32(13),
    ...ascii('IHDR'),
    ...u32(width),
    ...u32(height),
    ...[8, 6, 0, 0, 0],
    ...u32(0),
  ];
  const out = new Uint8Array(Math.max(padTo, bytes.length));
  out.set(bytes);
  return out;
}

interface GifOptions {
  frames: number;
  width?: number;
  height?: number;
  /** Every second picture brings a colour table of its own. */
  localTables?: boolean;
  trailer?: boolean;
}

function gif({ frames, width = 32, height = 24, localTables = false, trailer = true }: GifOptions) {
  // A global colour table of 2 entries (packed 0x80 → 2 ** 1 colours).
  const bytes = [
    ...ascii('GIF89a'),
    ...u16le(width),
    ...u16le(height),
    0x80,
    0,
    0,
    ...[0, 0, 0, 255, 255, 255],
  ];
  bytes.push(0x21, 0xff, 11, ...ascii('NETSCAPE2.0'), 3, 1, 0, 0, 0);
  for (let i = 0; i < frames; i++) {
    const local = localTables && i % 2 === 1;
    bytes.push(0x21, 0xf9, 4, 0, 10, 0, 0, 0);
    bytes.push(0x2c, ...u16le(0), ...u16le(0), ...u16le(width), ...u16le(height));
    bytes.push(local ? 0x81 : 0);
    if (local) bytes.push(...new Array<number>(12).fill(7));
    bytes.push(2, 3, 0x84, 0x8f, 0x01, 0);
  }
  if (trailer) bytes.push(0x3b);
  return new Uint8Array(bytes);
}

describe('readImageInfo', () => {
  it('reads the size of a PNG', () => {
    expect(readImageInfo(png(300, 120))).toEqual({
      mimeType: 'image/png',
      widthPx: 300,
      heightPx: 120,
      frameCount: 1,
    });
  });

  it('counts the pictures of a GIF, with and without colour tables of their own', () => {
    expect(readImageInfo(gif({ frames: 3 }))).toEqual({
      mimeType: 'image/gif',
      widthPx: 32,
      heightPx: 24,
      frameCount: 3,
    });
    expect(readImageInfo(gif({ frames: 4, localTables: true }))).toMatchObject({ frameCount: 4 });
    // Browsers show a GIF without its closing byte, so it counts.
    expect(readImageInfo(gif({ frames: 2, trailer: false }))).toMatchObject({ frameCount: 2 });
  });

  it('knows a broken file from one of another type', () => {
    // A BMP is another type; a JPEG cut off before its frame header is a broken one (M14).
    expect(readImageInfo(new Uint8Array([...ascii('BM'), 0, 0, 0, 0]))).toBe('unsupported');
    expect(readImageInfo(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('broken');
    expect(readImageInfo(new Uint8Array(ascii('<svg>')))).toBe('unsupported');
    expect(readImageInfo(png(10, 10).subarray(0, 20))).toBe('broken');
    expect(readImageInfo(png(0, 10))).toBe('broken');
    const whole = gif({ frames: 2 });
    expect(readImageInfo(whole.subarray(0, whole.length - 4))).toBe('broken');
    expect(readImageInfo(gif({ frames: 0 }))).toBe('broken');
    expect(readImageInfo(new Uint8Array([...ascii('GIF89a'), 1, 0, 1, 0, 0, 0, 0, 0x99]))).toBe(
      'broken',
    );
  });
});

describe('checkImage', () => {
  it('accepts a PNG or GIF within the limits', () => {
    expect(checkImage(png(512, 512))).toMatchObject({ ok: true, info: { widthPx: 512 } });
    expect(checkImage(gif({ frames: IMAGE_LIMITS.frames }))).toMatchObject({ ok: true });
  });

  it('says what is wrong, with the numbers for the message', () => {
    expect(checkImage(png(10, 10, IMAGE_LIMITS.bytes + 1))).toEqual({
      ok: false,
      problem: 'image.tooLarge',
      values: { bytes: IMAGE_LIMITS.bytes + 1, limit: IMAGE_LIMITS.bytes },
    });
    expect(checkImage(png(200, 513))).toEqual({
      ok: false,
      problem: 'image.tooWide',
      values: { widthPx: 200, heightPx: 513, limit: 512 },
    });
    expect(checkImage(gif({ frames: IMAGE_LIMITS.frames + 1 }))).toEqual({
      ok: false,
      problem: 'image.tooManyFrames',
      values: { frames: IMAGE_LIMITS.frames + 1, limit: IMAGE_LIMITS.frames },
    });
    expect(checkImage(new Uint8Array([1, 2, 3]))).toMatchObject({ problem: 'image.unsupported' });
    expect(checkImage(gif({ frames: 0 }))).toMatchObject({ problem: 'image.broken' });
  });
});

describe('assetFileName', () => {
  it('names the file after the asset and its type', () => {
    expect(assetFileName({ id: 'a_x1', mimeType: 'image/gif' })).toBe('a_x1.gif');
    expect(assetFileName({ id: 'a_x2', mimeType: 'image/png' })).toBe('a_x2.png');
  });
});
