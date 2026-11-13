import type { Migration } from './migrations';

// File format 5 (ADR 0012): a stage can show a height profile and count the metres climbed.
// Both are off in older projects, so nothing changes in how they look. Heights along a route
// (computed.elevation) are optional and simply missing in older files.

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
  return {
    ...etappe,
    overlays: { elevationProfile: false, elevationCounter: false, ...overlays },
  };
}

export const v4ToV5: Migration = {
  from: 4,
  to: 5,
  migrate: (data) => eachIn(data, 'groups', (group) => eachIn(group, 'etappen', migrateEtappe)),
};
