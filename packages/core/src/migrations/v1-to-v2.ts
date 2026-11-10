import type { Migration } from './migrations';

// File format 2 (ADR 0008): the route ahead gets its own opacity and dash instead of the
// on/off switch `futureRoute`, and the option badge goes. Old projects must look exactly as
// before.

type Json = Record<string, unknown>;

/** What format 1 drew for "ghost": the whole route at this opacity, in the line's own dash. */
const GHOST_OPACITY = 0.35;

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Updates every object in `record[key]`; anything unexpected is left for validation to report. */
function eachIn(record: Json, key: string, update: (item: Json) => Json): Json {
  const list = record[key];
  if (!Array.isArray(list)) return record;
  return { ...record, [key]: list.map((item: unknown) => (isRecord(item) ? update(item) : item)) };
}

function migrateStyle(style: Json): Json {
  const { futureRoute } = style;
  // An unknown value stays as it is, so validation names it.
  const ahead =
    futureRoute === 'hidden' || futureRoute === 'ghost'
      ? { opacity: futureRoute === 'ghost' ? GHOST_OPACITY : 0, dash: style.lineDash }
      : undefined;
  return Object.fromEntries(
    Object.entries(style)
      // Format 1 stored option badges but never drew them, and format 2 has none.
      .filter(([key]) => key !== 'variantBadge')
      // `ahead` takes the old field's place, so the file reads in the same order as before.
      .map(([key, value]) => (key === 'futureRoute' && ahead ? ['ahead', ahead] : [key, value])),
  );
}

export const v1ToV2: Migration = {
  from: 1,
  to: 2,
  migrate: (data) =>
    eachIn(data, 'groups', (group) =>
      eachIn(group, 'etappen', (etappe) =>
        eachIn(etappe, 'tracks', (track) =>
          isRecord(track.style) ? { ...track, style: migrateStyle(track.style) } : track,
        ),
      ),
    ),
};
