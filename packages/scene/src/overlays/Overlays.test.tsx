import {
  compileTimeline,
  computeFrameState,
  createEtappe,
  createProject,
  createTrack,
  createWaypoint,
  type Etappe,
} from '@travel-route-animator/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Overlays } from './Overlays';

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

describe('Overlays', () => {
  it('counts the kilometres and a typed travel time up to their full values', () => {
    const counters = { distanceCounter: true, timeCounter: true, manualDurationText: '3 h 05 min' };
    expect(frameAt(counters, 'start').text).toContain('0 km');
    expect(frameAt(counters, 'start').text).toContain('0 min');
    // Porto to Lisboa is about 275 km as the crow flies.
    const end = frameAt(counters, 'end').text;
    expect(end).toMatch(/\b27\d km\b/);
    expect(end).toContain('3:05 h');
  });

  it("shows the time of day in the stage's time zone, and nothing for speed without a recording", () => {
    const { text } = frameAt(
      {
        clockCounter: true,
        speedCounter: true,
        heartRateCounter: true,
        manualDurationText: '1 h',
      },
      'end',
      { source: 'manual', departure: '2026-07-14T08:30', timeZone: 'Europe/Lisbon' },
    );
    // Departure 08:30 plus the typed hour.
    expect(text).toContain('09:30');
    expect(text).not.toContain('km/h');
    expect(text).not.toContain('♥');
  });

  it('leaves out what is switched off', () => {
    const { text } = frameAt(
      { distanceCounter: false, timeCounter: false, attribution: false, title: undefined },
      'end',
    );
    expect(text.trim()).toBe('');
  });

  it('shows the title and puts the credits, map and routing, in the chosen corner', () => {
    const { html, text } = frameAt(
      { title: 'Tag 4', attribution: true, attributionCorner: 'top-left' },
      'start',
    );
    expect(text).toContain('Tag 4');
    expect(text).toContain('© OpenStreetMap');
    expect(html).toMatch(/top:10px;left:12px/);
  });
});
