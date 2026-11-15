import type { Migration } from './migrations';

// File format 8 (M16, ADR 0017): imported tracks may carry a recording (time, heart rate,
// cadence), tracks may move at their recorded pace, stages may have a clock, and there are
// counters for speed, heart rate and the time of day. Older stages get those counters switched
// off; everything else is new and optional.

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

const NEW_COUNTERS = { speedCounter: false, heartRateCounter: false, clockCounter: false };

export const v7ToV8: Migration = {
  from: 7,
  to: 8,
  migrate: (data) =>
    eachIn(data, 'groups', (group) =>
      eachIn(group, 'etappen', (etappe) =>
        isRecord(etappe.overlays)
          ? { ...etappe, overlays: { ...NEW_COUNTERS, ...etappe.overlays } }
          : etappe,
      ),
    ),
};
