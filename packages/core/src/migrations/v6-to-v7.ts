import type { Migration } from './migrations';

// File format 7 (ADR 0014): stages have pins (photos and places along the way), tracks may
// carry an imported line, and photos may be JPEG. Older stages get an empty list of pins;
// nothing else changes for them.

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Updates every object in `record[key]`; anything unexpected is left for validation to report. */
function eachIn(record: Json, key: string, update: (item: Json) => Json): Json {
  const list = record[key];
  if (!Array.isArray(list)) return record;
  return { ...record, [key]: list.map((item: unknown) => (isRecord(item) ? update(item) : item)) };
}

export const v6ToV7: Migration = {
  from: 6,
  to: 7,
  migrate: (data) =>
    eachIn(data, 'groups', (group) =>
      eachIn(group, 'etappen', (etappe) => ('pins' in etappe ? etappe : { ...etappe, pins: [] })),
    ),
};
