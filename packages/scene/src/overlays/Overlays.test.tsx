import {
  compileTimeline,
  computeFrameState,
  createEtappe,
  createProject,
  createTrack,
  createWaypoint,
  type Etappe,
  type Widget,
} from '@travel-route-animator/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Overlays, placementOf, presenceOf, splitAnchor } from './Overlays';

// The overlays are plain HTML from the frame state, so they render on the server too: what a
// frame shows can be read as text, without a browser or a map.

/** A train from Porto to Lisboa, ten seconds long, with these overlays. */
function frameAt(
  overlays: Partial<Etappe['overlays']>,
  at: 'start' | 'end',
  clock?: Etappe['clock'],
) {
  const base = createTrack({
    vehicleType: 'train',
    waypoints: [
      createWaypoint({ name: 'Porto', lngLat: [-8.61, 41.15] }),
      createWaypoint({ name: 'Lisboa', lngLat: [-9.14, 38.72] }),
    ],
  });
  const etappe = createEtappe({
    name: 'Porto – Lisboa',
    tracks: [{ ...base, routing: { mode: 'straight' } }],
    durationSec: 10,
  });
  const project = {
    ...createProject('Trip'),
    groups: [
      {
        id: 'g',
        name: 'G',
        etappen: [
          { ...etappe, overlays: { ...etappe.overlays, ...overlays }, ...(clock && { clock }) },
        ],
      },
    ],
  };
  const timeline = compileTimeline(project, etappe.id);
  const frame = at === 'start' ? 0 : timeline.durationInFrames - 1;
  const html = renderToStaticMarkup(
    <Overlays
      timeline={timeline}
      state={computeFrameState(timeline, frame)}
      credits={['© OpenStreetMap']}
    />,
  );
  // The text a viewer reads, without the markup around it.
  return { html, text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') };
}

/** A block of the overlay kit, bottom left unless said otherwise. */
const block = (kind: Widget['kind'], extra: Partial<Widget> = {}): Widget => ({
  id: `w_${kind}`,
  kind,
  anchor: 'bottom-left',
  dx: 48,
  dy: 44,
  scale: 1,
  transition: 'none',
  ...extra,
});

describe('Overlays', () => {
  it('counts the kilometres and a typed travel time up to their full values', () => {
    const counters = {
      manualDurationText: '3 h 05 min',
      widgets: [block('distance'), block('travelTime', { dx: 300 })],
    };
    expect(frameAt(counters, 'start').text).toContain('0 km');
    expect(frameAt(counters, 'start').text).toContain('0 min');
    // Porto to Lisboa is about 275 km as the crow flies.
    const end = frameAt(counters, 'end').text;
    expect(end).toMatch(/\b27\d km\b/);
    expect(end).toContain('3:05 h');
  });

  it('shows nothing without blocks and credits', () => {
    const { text } = frameAt({ widgets: [], attribution: false }, 'end');
    expect(text.trim()).toBe('');
  });

  it('shows a title and puts the credits, map and routing, in the chosen corner', () => {
    const { html, text } = frameAt(
      {
        widgets: [block('text', { text: 'Tag 4', anchor: 'top-left' })],
        attribution: true,
        attributionCorner: 'top-left',
      },
      'start',
    );
    expect(text).toContain('Tag 4');
    expect(text).toContain('© OpenStreetMap');
    expect(html).toMatch(/top:10px;left:12px/);
  });

  it("shows the time of day in the stage's time zone, and nothing for speed without a recording", () => {
    const { text } = frameAt(
      {
        manualDurationText: '1 h',
        widgets: [block('clock'), block('speed', { dx: 300 }), block('heartRate', { dx: 600 })],
      },
      'end',
      { source: 'manual', departure: '2026-07-14T08:30', timeZone: 'Europe/Lisbon' },
    );
    // Departure 08:30 plus the typed hour.
    expect(text).toContain('09:30');
    expect(text).not.toContain('km/h');
    expect(text).not.toContain('♥');
  });

  it('writes a block in its own units and with its caption', () => {
    const { text } = frameAt(
      { widgets: [block('distance', { unit: 'imperial', label: 'Gefahren' })] },
      'end',
    );
    expect(text).toContain('Gefahren');
    expect(text).toMatch(/\b17\d mi\b/);
  });

  it('draws in the style of the stage, a block changing it for itself', () => {
    const { html } = frameAt(
      {
        style: { styleId: 'sport' },
        widgets: [
          block('text', { text: 'Tag 4' }),
          block('text', { id: 'w_other', text: 'Porto', style: { textColor: '#ff0000' } }),
        ],
      },
      'start',
    );
    expect(html).toContain('TRA Oswald');
    expect(html).toContain('text-transform:uppercase');
    expect(html).toContain('color:#ff0000');
  });
});

describe('placing blocks', () => {
  it('measures from the anchor: inwards from the edges, from the middle in the centre', () => {
    expect(
      placementOf(block('distance', { anchor: 'bottom-right', dx: 30, dy: 40 })),
    ).toMatchObject({
      right: 30,
      bottom: 40,
      transformOrigin: 'bottom right',
    });
    const centred = placementOf(block('distance', { anchor: 'center', dx: -20, dy: 10, scale: 2 }));
    expect(centred).toMatchObject({ left: 'calc(50% + -20px)', top: 'calc(50% + 10px)' });
    expect(centred.transform).toBe('translateX(-50%) translateY(-50%) scale(2)');
    expect(splitAnchor('top')).toEqual(['top', 'center']);
  });

  it('fades a block in and out over its time window', () => {
    const shown = block('distance', { fromSec: 2, toSec: 5, transition: 'fade' });
    expect(presenceOf(shown, 1)).toBe(0);
    expect(presenceOf(shown, 2.2)).toBeCloseTo(0.5, 6);
    expect(presenceOf(shown, 3.5)).toBe(1);
    expect(presenceOf(shown, 4.9)).toBeCloseTo(0.25, 6);
    expect(presenceOf(block('distance', { fromSec: 2 }), 2)).toBe(1);
    expect(presenceOf(block('distance'), -1)).toBe(1);
  });
});
