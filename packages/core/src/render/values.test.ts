import { describe, expect, it } from 'vitest';
import { createEtappe, createProject, createTrack, createWaypoint } from '../model/factories';
import type { Etappe } from '../model/etappe';
import type { Widget } from '../model/overlays';
import type { Project } from '../model/project';
import { compileSequence } from '../timeline/sequence';
import { fusionSettingOf, simplifyKeys } from './fusion';
import { mgjsonOf, srtOf, valuesCsv, valuesJson, valueTracksOf } from './values';

// The values of the overlay blocks for the edit (M18): a train from Porto to Lisboa, ten
// seconds at 25 fps, with a few blocks.

const block = (id: string, kind: Widget['kind'], extra: Partial<Widget> = {}): Widget => ({
  id,
  kind,
  anchor: 'bottom-left',
  dx: 48,
  dy: 44,
  scale: 1,
  transition: 'none',
  ...extra,
});

function stage(name: string, widgets: Widget[], extra: Partial<Etappe> = {}): Etappe {
  const base = createTrack({
    vehicleType: 'train',
    waypoints: [
      createWaypoint({ name: 'Porto', lngLat: [-8.61, 41.15] }),
      createWaypoint({ name: 'Lisboa', lngLat: [-9.14, 38.72] }),
    ],
  });
  const etappe = createEtappe({
    name,
    tracks: [{ ...base, routing: { mode: 'straight' } }],
    durationSec: 10,
  });
  return {
    ...etappe,
    ...extra,
    overlays: { ...etappe.overlays, manualDurationText: '3 h 05 min', widgets },
  };
}

function project(...etappen: Etappe[]): Project {
  return { ...createProject('Trip'), groups: [{ id: 'g', name: 'G', etappen }] };
}

const widgets = [
  block('w_km', 'distance', { decimals: 1 }),
  block('w_time', 'travelTime'),
  block('w_title', 'text', { text: 'Tag 4', fromSec: 2, toSec: 4 }),
  block('w_clock', 'clock', { label: 'Uhrzeit' }),
  block('w_flag', 'flag'),
];
const clock = {
  source: 'manual' as const,
  departure: '2026-06-12T08:30',
  timeZone: 'Europe/Lisbon',
};

function trainValues() {
  const p = project(stage('Porto – Lisboa', widgets, { clock }));
  const etappeId = p.groups[0]!.etappen[0]!.id;
  return valueTracksOf(p, compileSequence(p, [etappeId]));
}

describe('values of the overlay blocks', () => {
  it('follows every block with text through every frame, in its units', () => {
    const values = trainValues();
    expect(values.fps).toBe(25);
    expect(values.tracks.map((t) => [t.name, t.title, t.channels.map((c) => c.unit)])).toEqual([
      ['distance', 'Distanz', ['km']],
      ['travel-time', 'Reisezeit', ['s']],
      ['tag-4', 'Tag 4', []],
      ['uhrzeit', 'Uhrzeit', ['min']],
    ]);
    const [km, time, title, clockTrack] = values.tracks;
    const last = values.durationInFrames - 1;
    expect(km!.text[0]).toBe('0,0 km');
    expect(km!.text[last]).toMatch(/^2\d\d,\d km$/);
    expect(km!.channels[0]!.values[last]).toBeCloseTo(
      Number(km!.text[last]!.replace(/[^\d,]/g, '').replace(',', '.')),
      0,
    );
    expect(time!.text[last]).toBe('3:05 h');
    expect(time!.channels[0]!.values[last]).toBe(185 * 60);
    // The title only within its time window, seconds into the main part.
    const shown = title!.text.flatMap((text, frame) => (text ? [frame] : []));
    expect(shown.length).toBeGreaterThan(40);
    expect(shown.length).toBeLessThan(60);
    expect(clockTrack!.text[0]).toBe('08:30');
    expect(clockTrack!.channels[0]!.values[0]).toBe(510);
    expect(clockTrack!.channels[0]!.values[last]).toBe(510 + 185);
  });

  it('names the blocks of a sequence after their stages and counts each only while it plays', () => {
    const first = stage('Tag 1', [block('w_a', 'distance')]);
    const second = { ...stage('Tag 2', [block('w_b', 'distance')]), id: 'e_2' };
    const p = project(first, second);
    const values = valueTracksOf(p, compileSequence(p, [first.id, second.id]));
    expect(values.tracks.map((t) => t.name)).toEqual(['tag-1-distance', 'tag-2-distance']);
    const [a, b] = values.tracks;
    expect(a!.text[0]).toBe('0 km');
    expect(b!.text[0]).toBeUndefined();
    expect(a!.text.at(-1)).toBeUndefined();
    expect(b!.channels[0]!.values.at(-1)).toBeGreaterThan(200);
  });

  it('writes a block as subtitles that change with its text', () => {
    const values = trainValues();
    const title = srtOf(values.tracks[2]!, values.fps)!;
    expect(title.split('\n\n')).toHaveLength(1);
    expect(title).toMatch(/^1\n00:00:0\d,\d{3} --> 00:00:0\d,\d{3}\nTag 4\n$/);
    const km = srtOf(values.tracks[0]!, values.fps)!;
    expect(km.startsWith('1\n00:00:00,000 --> 00:00:00,')).toBe(true);
    // One entry per change, not per frame.
    expect(km.split('\n\n').length).toBeLessThan(values.durationInFrames);
    expect(srtOf({ ...values.tracks[0]!, text: [undefined, undefined] }, 25)).toBeUndefined();
  });

  it('writes a table and JSON with the text and the numbers of every frame', () => {
    const values = trainValues();
    const lines = valuesCsv(values).trim().split('\n');
    expect(lines[0]).toBe(
      'frame,time_s,distance,distance.distance_km,travel-time,travel-time.seconds_s,tag-4,uhrzeit,uhrzeit.minutes_min',
    );
    expect(lines[1]).toBe('0,0,"0,0 km",0,"0 min",0,,"08:30",510');
    expect(lines).toHaveLength(values.durationInFrames + 1);
    const json = JSON.parse(valuesJson(values)) as { blocks: { name: string; text: unknown[] }[] };
    expect(json.blocks.map((b) => b.name)).toEqual(['distance', 'travel-time', 'tag-4', 'uhrzeit']);
    expect(json.blocks[2]!.text[0]).toBeNull();
  });

  it('writes MGJSON for After Effects, numbers padded and every stream from frame 0', () => {
    const values = trainValues();
    const file = JSON.parse(mgjsonOf(values)) as {
      version: string;
      dataOutline: Record<string, unknown>[];
      dataDynamicSamples: { samples: { time: string; value: unknown }[] }[];
    };
    expect(file.version).toBe('MGJSON2.0.0');
    const distance = file.dataOutline[0]!;
    expect(distance).toMatchObject({
      objectType: 'dataDynamic',
      displayName: 'Distanz (km)',
      hasExpectedFrequecyB: false,
      interpolation: 'linear',
      dataType: {
        type: 'numberString',
        numberStringProperties: { pattern: { isSigned: true, digitsInteger: 3, digitsDecimal: 1 } },
      },
    });
    const samples = file.dataDynamicSamples[0]!.samples;
    expect(samples[0]).toEqual({ time: '2000-01-01T00:00:00.000Z', value: '+000.0' });
    expect(samples[1]!.time).toBe('2000-01-01T00:00:00.040Z');
    expect(distance.sampleCount).toBe(samples.length);
    // Texts hold until they change; the title is empty before its window.
    const title = file.dataOutline.find((s) => s.displayName === 'Tag 4: Text')!;
    expect(title.dataType).toEqual({
      type: 'paddedString',
      paddedStringProperties: { maxLen: 5, maxDigitsInStrLength: 1, eventMarkerB: false },
    });
    const titleSamples = file.dataDynamicSamples[file.dataOutline.indexOf(title)]!.samples;
    expect(titleSamples.map((s) => s.value)).toEqual([
      { length: '0', str: '     ' },
      { length: '5', str: 'Tag 4' },
      { length: '0', str: '     ' },
    ]);
  });
});

describe('Fusion setting', () => {
  it('keeps only the keyframes a straight line cannot replace', () => {
    const line = Array.from({ length: 50 }, (_, frame) => ({ frame, value: frame * 2 }));
    expect(simplifyKeys(line, 0.04)).toEqual([line[0], line[49]]);
    const bend = [...line.slice(0, 25), ...line.slice(25).map((k) => ({ ...k, value: 48 }))];
    expect(simplifyKeys(bend, 0.04).map((k) => k.frame)).toEqual([0, 24, 49]);
  });

  it('adds a counting Text+ node per block with numbers, and none for plain text', () => {
    const setting = fusionSettingOf(trainValues())!;
    expect(setting.startsWith('{\n\tTools = ordered() {')).toBe(true);
    expect(setting).toContain('\t\tDistance = TextPlus {');
    expect(setting).toContain('\t\tDistanceRouteValue = BezierSpline {');
    expect(setting).toContain(
      'RouteValue = Input { SourceOp = "DistanceRouteValue", Source = "Value", },',
    );
    expect(setting).toContain(
      'Expression = "Text((string.format(\\"%.1f km\\", RouteValue):gsub(\\"%.\\", \\",\\")))",',
    );
    expect(setting).toContain('\t\tUhrzeit = TextPlus {');
    expect(setting).not.toContain('Tag4 = TextPlus');
    // The ride speeds up and slows down, so it needs keys, but far fewer than frames.
    const values = trainValues();
    const keys = setting.split('DistanceRouteValue = BezierSpline')[1]!.split('}\n\t\t},')[0]!;
    expect(keys.match(/\[\d+\] =/g)!.length).toBeLessThan(values.durationInFrames / 2);
    expect(fusionSettingOf({ ...trainValues(), tracks: [] })).toBeUndefined();
  });

  it('writes Lua that holds together: strings closed, brackets balanced, also in expressions', () => {
    /** The Lua strings of a text and whether its brackets balance outside them. */
    const scan = (source: string) => {
      const strings: string[] = [];
      const open: string[] = [];
      const pairs: Record<string, string> = { ')': '(', '}': '{', ']': '[' };
      let balanced = true;
      for (let i = 0; i < source.length; i++) {
        const char = source[i]!;
        if (char === '"') {
          let text = '';
          for (i++; source[i] !== '"'; i++) {
            if (i >= source.length) throw new Error('unclosed string');
            if (source[i] === '\\') i++;
            text += source[i];
          }
          strings.push(text);
        } else if ('({['.includes(char)) open.push(char);
        else if (char in pairs && open.pop() !== pairs[char]) balanced = false;
      }
      return { strings, balanced: balanced && open.length === 0 };
    };
    const setting = scan(fusionSettingOf(trainValues())!);
    expect(setting.balanced).toBe(true);
    const expressions = setting.strings.filter((text) => text.startsWith('Text('));
    expect(expressions).toHaveLength(3);
    for (const expression of expressions) expect(scan(expression).balanced).toBe(true);
  });
});
