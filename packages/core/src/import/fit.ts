import { ImportError, type ImportedTrackData, type ImportPoint } from './parse';

// Garmin's FIT format (M16): the binary file a watch or bike computer records, and what
// Garmin Connect and Strava hand out with "Export Original". Only what a track needs is read:
// the record messages (position, time, height, heart rate, cadence) and the sport. Layout and
// field numbers follow Garmin's FIT SDK (decoder.js and profile.js of fit-javascript-sdk).

/** FIT timestamps count seconds from 1989-12-31 00:00 UTC. */
const FIT_EPOCH_S = 631_065_600;
/** Positions are "semicircles": 2^31 of them make 180 degrees. */
const DEGREES_PER_SEMICIRCLE = 180 / 2 ** 31;

const MESSAGE = { sport: 12, session: 18, record: 20 } as const;
const RECORD = {
  latitude: 0,
  longitude: 1,
  altitude: 2,
  heartRate: 3,
  cadence: 4,
  enhancedAltitude: 78,
  timestamp: 253,
} as const;
/** The sport field: 5 in a session message, 0 in a sport message. */
const SPORT_FIELD = { [MESSAGE.session]: 5, [MESSAGE.sport]: 0 } as Record<number, number>;

/** FIT's sport numbers, as the words vehicleForActivity understands. */
const SPORTS: Record<number, string> = {
  1: 'running',
  2: 'cycling',
  11: 'walking',
  16: 'mountaineering',
  17: 'hiking',
  21: 'e-biking',
};

interface FieldDefinition {
  num: number;
  size: number;
  /** Signed types: sint8 (1), sint16 (3), sint32 (5), sint64 (14). */
  signed: boolean;
}

interface MessageDefinition {
  global: number;
  littleEndian: boolean;
  fields: FieldDefinition[];
  /** Developer fields are skipped; only their total size matters. */
  developerBytes: number;
}

const SIGNED_BASE_TYPES = new Set([1, 3, 5, 14]);

/** Whether the bytes start like a FIT file: a 12 or 14 byte header with ".FIT" at 8. */
export function isFit(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    (bytes[0] === 12 || bytes[0] === 14) &&
    String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!) === '.FIT'
  );
}

/** An unsigned or signed integer field; undefined where FIT marks it as invalid. */
function readInteger(
  view: DataView,
  at: number,
  field: FieldDefinition,
  littleEndian: boolean,
): number | undefined {
  switch (field.size) {
    case 1: {
      const value = field.signed ? view.getInt8(at) : view.getUint8(at);
      return value === (field.signed ? 0x7f : 0xff) ? undefined : value;
    }
    case 2: {
      const value = field.signed
        ? view.getInt16(at, littleEndian)
        : view.getUint16(at, littleEndian);
      return value === (field.signed ? 0x7fff : 0xffff) ? undefined : value;
    }
    case 4: {
      const value = field.signed
        ? view.getInt32(at, littleEndian)
        : view.getUint32(at, littleEndian);
      return value === (field.signed ? 0x7fffffff : 0xffffffff) ? undefined : value;
    }
    default:
      return undefined;
  }
}

/**
 * The track of a FIT activity: every record message with a position, in order. Chained FIT
 * files (several in one) are read one after the other.
 */
export function parseFit(bytes: Uint8Array, fileName: string): ImportedTrackData {
  if (!isFit(bytes)) throw new ImportError('This is not a FIT file');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const points: ImportPoint[] = [];
  let sport: number | undefined;

  let fileStart = 0;
  while (fileStart + 12 <= bytes.length && isFit(bytes.subarray(fileStart))) {
    const headerSize = bytes[fileStart]!;
    const dataSize = view.getUint32(fileStart + 4, true);
    const end = Math.min(bytes.length, fileStart + headerSize + dataSize);
    const definitions = new Map<number, MessageDefinition>();
    let lastTimestamp: number | undefined;
    let at = fileStart + headerSize;

    const readMessage = (definition: MessageDefinition, compressedTimestamp?: number) => {
      const values = new Map<number, number>();
      for (const field of definition.fields) {
        if (at + field.size > end)
          throw new ImportError('The FIT file ends in the middle of a message');
        const value = readInteger(view, at, field, definition.littleEndian);
        if (value !== undefined) values.set(field.num, value);
        at += field.size;
      }
      at += definition.developerBytes;
      const timestamp = values.get(RECORD.timestamp) ?? compressedTimestamp;
      if (values.has(RECORD.timestamp)) lastTimestamp = values.get(RECORD.timestamp);

      if (definition.global in SPORT_FIELD) {
        sport ??= values.get(SPORT_FIELD[definition.global]!);
      }
      if (definition.global !== MESSAGE.record) return;
      const lat = values.get(RECORD.latitude);
      const lng = values.get(RECORD.longitude);
      if (lat === undefined || lng === undefined) return;
      const latitude = lat * DEGREES_PER_SEMICIRCLE;
      const longitude = lng * DEGREES_PER_SEMICIRCLE;
      if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return;
      const raw = values.get(RECORD.enhancedAltitude) ?? values.get(RECORD.altitude);
      const hr = values.get(RECORD.heartRate);
      const cad = values.get(RECORD.cadence);
      points.push({
        lngLat: [longitude, latitude],
        // Altitudes are stored as (metres + 500) × 5.
        ...(raw !== undefined && { ele: raw / 5 - 500 }),
        ...(timestamp !== undefined && { time: (timestamp + FIT_EPOCH_S) * 1000 }),
        ...(hr !== undefined && hr > 0 && { hr }),
        ...(cad !== undefined && cad > 0 && { cad }),
      });
    };

    while (at < end) {
      const header = bytes[at++]!;
      if (header & 0x80) {
        // Compressed timestamp header: 2 bits of local message type, 5 bits of seconds that
        // roll over every 32 seconds from the last full timestamp.
        const definition = definitions.get((header >> 5) & 0x03);
        if (!definition) throw new ImportError('The FIT file uses a message it never defined');
        let timestamp: number | undefined;
        if (lastTimestamp !== undefined) {
          const offset = header & 0x1f;
          timestamp = lastTimestamp + ((offset - (lastTimestamp & 0x1f)) & 0x1f);
          lastTimestamp = timestamp;
        }
        readMessage(definition, timestamp);
      } else if (header & 0x40) {
        // Definition: reserved byte, architecture, global message number, fields.
        const littleEndian = bytes[at + 1] === 0;
        const global = view.getUint16(at + 2, littleEndian);
        const count = bytes[at + 4]!;
        at += 5;
        const fields: FieldDefinition[] = [];
        for (let i = 0; i < count; i++) {
          fields.push({
            num: bytes[at]!,
            size: bytes[at + 1]!,
            signed: SIGNED_BASE_TYPES.has(bytes[at + 2]! & 0x1f),
          });
          at += 3;
        }
        let developerBytes = 0;
        if (header & 0x20) {
          const developerCount = bytes[at++]!;
          for (let i = 0; i < developerCount; i++) {
            developerBytes += bytes[at + 1]!;
            at += 3;
          }
        }
        definitions.set(header & 0x0f, { global, littleEndian, fields, developerBytes });
      } else {
        const definition = definitions.get(header & 0x0f);
        if (!definition) throw new ImportError('The FIT file uses a message it never defined');
        readMessage(definition);
      }
    }
    // Every file in a chain ends with a 2 byte CRC.
    fileStart = end + 2;
  }

  if (points.length < 2) {
    throw new ImportError('The FIT file holds no track with two points (an indoor activity?)');
  }
  const activity = sport !== undefined ? SPORTS[sport] : undefined;
  return {
    source: 'fit',
    name: fileName.replace(/\.fit$/i, ''),
    points,
    waypoints: [],
    ...(activity && { activity }),
  };
}
