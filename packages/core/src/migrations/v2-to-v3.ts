import type { Migration } from './migrations';

// File format 3 (ADR 0009): a track says what stands for its vehicle (style.icon), and the
// project lists its own files (assets). Old projects keep their vehicle icons, so nothing
// changes in how they look.

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

function migrateTrack(track: Json): Json {
  const { style } = track;
  // A style that already has an icon, or none at all, is left for validation to judge.
  if (!isRecord(style) || 'icon' in style) return track;
  return { ...track, style: { ...style, icon: { kind: 'catalog' } } };
}

export const v2ToV3: Migration = {
  from: 2,
  to: 3,
  migrate: (data) => {
    const project = eachIn(data, 'groups', (group) =>
      eachIn(group, 'etappen', (etappe) => eachIn(etappe, 'tracks', migrateTrack)),
    );
    return 'assets' in project ? project : { ...project, assets: [] };
  },
};
