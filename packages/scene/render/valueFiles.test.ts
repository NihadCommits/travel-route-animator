import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  addEtappe,
  addGroup,
  addTrack,
  addWaypoint,
  addWidget,
  createProject,
  editEtappe,
  editWidget,
} from '@travel-route-animator/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { namedBlocks, writeValueFiles } from './valueFiles';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tra-values-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** A train with a distance, a caption-less flag and a typed travel time. */
function props() {
  const group = addGroup(createProject('Trip'), 'Tag 1');
  const stage = addEtappe(group.project, group.id, 'Westbahn');
  const train = addTrack(stage.project, stage.id, 'train');
  let project = train.project;
  for (const [name, lngLat] of [
    ['Salzburg', [13.04, 47.8]],
    ['Wien', [16.37, 48.21]],
  ] as const) {
    project = addWaypoint(project, train.id, { name, lngLat: [...lngLat] }).project;
  }
  const km = addWidget(project, stage.id, 'distance');
  const flag = addWidget(km.project, stage.id, 'flag');
  const time = addWidget(flag.project, stage.id, 'travelTime');
  project = editWidget(time.project, km.id, (w) => ({ ...w, label: 'Gefahren' }));
  project = editEtappe(project, stage.id, (e) => ({
    ...e,
    overlays: { ...e.overlays, manualDurationText: '2 h 30 min' },
  }));
  return { project, etappeId: stage.id, output: { resolution: '720p' as const } };
}

describe('the values next to a render', () => {
  it('writes CSV, JSON, MGJSON, a Fusion setting and an SRT per block with text', async () => {
    const base = join(dir, 'westbahn_16x9');
    const written = await writeValueFiles(props(), base);
    expect((await readdir(dir)).sort()).toEqual([
      'westbahn_16x9.gefahren.srt',
      'westbahn_16x9.travel-time.srt',
      'westbahn_16x9.values.csv',
      'westbahn_16x9.values.json',
      'westbahn_16x9.values.mgjson',
      'westbahn_16x9.values.setting',
    ]);
    expect(written).toHaveLength(6);
    const srt = await readFile(`${base}.travel-time.srt`, 'utf8');
    expect(srt.startsWith('1\n00:00:00,000 --> ')).toBe(true);
    expect(srt.trim().endsWith('2:30 h')).toBe(true);
    const csv = await readFile(`${base}.values.csv`, 'utf8');
    expect(csv.split('\n')[0]).toBe(
      'frame,time_s,gefahren,gefahren.distance_km,travel-time,travel-time.seconds_s',
    );
  });

  it('names every block for its own video, also those that draw a picture', () => {
    expect(namedBlocks(props()).map((block) => block.name)).toEqual([
      'gefahren',
      'flag',
      'travel-time',
    ]);
  });
});
