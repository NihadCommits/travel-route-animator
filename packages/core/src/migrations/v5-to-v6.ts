import type { Migration } from './migrations';

// File format 6 (ADR 0013): the map credits sit in a corner of one's choosing, and a render can
// be a PNG sequence. Older projects keep their credits at the bottom right, where they were.

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

function migrateEtappe(etappe: Json): Json {
  const { overlays } = etappe;
  if (!isRecord(overlays)) return etappe;
  return { ...etappe, overlays: { attributionCorner: 'bottom-right', ...overlays } };
}

export const v5ToV6: Migration = {
  from: 5,
  to: 6,
  migrate: (data) => eachIn(data, 'groups', (group) => eachIn(group, 'etappen', migrateEtappe)),
};
