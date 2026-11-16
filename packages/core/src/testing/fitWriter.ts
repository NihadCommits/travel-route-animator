// Writes small FIT files for tests (M16): the same layout a watch writes, with definition and
// data messages, so the decoder is tested against bytes, not against itself. Field numbers and
// base types as in Garmin's FIT SDK.

export interface FitTestPoint {
  /** Seconds since 1970. */
  timeS: number;
  lat: number;
  lng: number;
  ele?: number;
  hr?: number;
  cad?: number;
}

export interface FitWriteOptions {
  /** FIT sport number, written as a session message (2 = cycling, 17 = hiking). */
  sport?: number;
  /** Write the records big-endian, as some devices do. */
  bigEndian?: boolean;
  /** Give every record a developer field, which a reader has to skip. */
  developerField?: boolean;
  /** Write every second record with a compressed timestamp header instead of a timestamp field. */
  compressTimestamps?: boolean;
}

const FIT_EPOCH_S = 631_065_600;
const SEMICIRCLES = 2 ** 31 / 180;

class Bytes {
  private readonly data: number[] = [];
  u8(value: number) {
    this.data.push(value & 0xff);
    return this;
  }
  u16(value: number, little = true) {
    const b = [value & 0xff, (value >> 8) & 0xff];
    this.data.push(...(little ? b : b.reverse()));
    return this;
  }
  u32(value: number, little = true) {
    const v = value >>> 0;
    const b = [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
    this.data.push(...(little ? b : b.reverse()));
    return this;
  }
  bytes(values: number[]) {
    this.data.push(...values);
    return this;
  }
  get length() {
    return this.data.length;
  }
  toArray() {
    return [...this.data];
  }
}

/** A FIT activity file with these points as record messages. */
export function writeFit(points: FitTestPoint[], options: FitWriteOptions = {}): Uint8Array {
  const little = !options.bigEndian;
  const body = new Bytes();

  if (options.sport !== undefined) {
    // Definition, local 1: session (18), field 5 sport (enum, 1 byte). Then its data.
    body.u8(0x41).u8(0).u8(0).u16(18).u8(1).bytes([5, 1, 0x00]);
    body.u8(0x01).u8(options.sport);
  }

  // Definition, local 0: record (20). Field triplets: number, size, base type.
  const fields: [number, number, number][] = [
    [253, 4, 0x86], // timestamp, uint32
    [0, 4, 0x85], // position_lat, sint32
    [1, 4, 0x85], // position_long, sint32
    [78, 4, 0x86], // enhanced_altitude, uint32
    [3, 1, 0x02], // heart_rate, uint8
    [4, 1, 0x02], // cadence, uint8
  ];
  const dev = options.developerField === true;
  body
    .u8(dev ? 0x60 : 0x40)
    .u8(0)
    .u8(little ? 0 : 1)
    .u16(20, little)
    .u8(fields.length);
  for (const field of fields) body.bytes(field);
  if (dev) body.u8(1).bytes([0, 2, 0]); // one developer field of 2 bytes

  // For compressed headers: local 2, the same record without the timestamp field.
  if (options.compressTimestamps) {
    const rest = fields.slice(1);
    body
      .u8(0x42)
      .u8(0)
      .u8(little ? 0 : 1)
      .u16(20, little)
      .u8(rest.length);
    for (const field of rest) body.bytes(field);
  }

  points.forEach((point, i) => {
    const fitTime = point.timeS - FIT_EPOCH_S;
    const compressed = options.compressTimestamps === true && i % 2 === 1;
    if (compressed) body.u8(0x80 | (2 << 5) | (fitTime & 0x1f));
    else body.u8(0x00).u32(fitTime, little);
    body
      .u32(Math.round(point.lat * SEMICIRCLES), little)
      .u32(Math.round(point.lng * SEMICIRCLES), little)
      .u32(point.ele === undefined ? 0xffffffff : Math.round((point.ele + 500) * 5), little)
      .u8(point.hr ?? 0xff)
      .u8(point.cad ?? 0xff);
    if (dev && !compressed) body.bytes([0x12, 0x34]);
  });

  const header = new Bytes()
    .u8(14)
    .u8(0x20)
    .u16(2132)
    .u32(body.length)
    .bytes([...'.FIT'].map((c) => c.charCodeAt(0)))
    .u16(0);
  // The CRC at the end is not checked by the reader; zeros keep the layout right.
  return new Uint8Array([...header.toArray(), ...body.toArray(), 0, 0]);
}
