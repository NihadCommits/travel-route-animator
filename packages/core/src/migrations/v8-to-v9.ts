import type { Migration } from './migrations';

// File format 9 (M17, ADR 0017): the overlays are building blocks instead of switches. Every
// switch that was on becomes a block where its value stood: the title at the top left, the
// counters at the bottom left, the height profile below them. The counters stood in a row
// that grew with its text; the first keeps that place and the others stand right of it
// (`after`), so the row looks as it did. The project gets the classic style and metric units,
// which is how it looked before.

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function eachIn(record: Json, key: string, update: (item: Json) => Json): Json {
  const list = record[key];
  if (!Array.isArray(list)) return record;
  return { ...record, [key]: list.map((item: unknown) => (isRecord(item) ? update(item) : item)) };
}

/** Distance from the picture's edges, as the overlays had it. */
const MARGIN = 48;
const BOTTOM = 44;
/** The credits at the bottom left take this much room below the counters. */
const CREDITS_HEIGHT = 36;
const GAP = 16;
/** A counter pill at the classic size, and the height profile without and with the climb. */
const PILL_HEIGHT = 76;
const PROFILE_HEIGHT = 154;
const ROW = [
  ['distanceCounter', 'distance'],
  ['timeCounter', 'travelTime'],
  ['clockCounter', 'clock'],
  ['speedCounter', 'speed'],
  ['heartRateCounter', 'heartRate'],
] as const;

function block(id: string, kind: string, anchor: string, dx: number, dy: number, extra: Json = {}) {
  return { id, kind, anchor, dx, dy, scale: 1, transition: 'none', ...extra };
}

function widgetsOf(etappe: Json, overlays: Json): Json[] {
  const key = typeof etappe.id === 'string' ? etappe.id : 'etappe';
  const id = (kind: string) => `w_${key}_${kind}`;
  const widgets: Json[] = [];
  if (typeof overlays.title === 'string' && overlays.title !== '') {
    widgets.push(
      block(id('title'), 'text', 'top-left', MARGIN, BOTTOM, {
        text: overlays.title,
        // The title was a little bigger than the counters.
        style: { size: 52 },
      }),
    );
  }
  let dy =
    BOTTOM +
    (overlays.attribution === true && overlays.attributionCorner === 'bottom-left'
      ? CREDITS_HEIGHT
      : 0);
  if (overlays.elevationProfile === true) {
    widgets.push(block(id('elevationProfile'), 'elevationProfile', 'bottom-left', MARGIN, dy));
    dy += PROFILE_HEIGHT + GAP;
  }
  if (overlays.elevationCounter === true) {
    widgets.push(block(id('climb'), 'climb', 'bottom-left', MARGIN, dy));
    dy += PILL_HEIGHT + GAP;
  }
  let previous: string | undefined;
  for (const [flag, kind] of ROW) {
    if (overlays[flag] !== true) continue;
    widgets.push(
      block(id(kind), kind, 'bottom-left', MARGIN, dy, previous ? { after: previous } : {}),
    );
    previous = id(kind);
  }
  return widgets;
}

const OLD_SWITCHES = [
  'distanceCounter',
  'timeCounter',
  'title',
  'elevationProfile',
  'elevationCounter',
  'speedCounter',
  'heartRateCounter',
  'clockCounter',
];

export const v8ToV9: Migration = {
  from: 8,
  to: 9,
  migrate: (data) => {
    const defaults = isRecord(data.defaults)
      ? { overlayStyle: { styleId: 'classic' }, units: 'metric', ...data.defaults }
      : data.defaults;
    return eachIn({ ...data, defaults }, 'groups', (group) =>
      eachIn(group, 'etappen', (etappe) => {
        const { overlays } = etappe;
        if (!isRecord(overlays)) return etappe;
        // The switches go in any case; blocks are only made where there are none yet.
        const rest = Object.fromEntries(
          Object.entries(overlays).filter(([key]) => !OLD_SWITCHES.includes(key)),
        );
        const widgets = 'widgets' in overlays ? overlays.widgets : widgetsOf(etappe, overlays);
        return { ...etappe, overlays: { ...rest, widgets } };
      }),
    );
  },
};
