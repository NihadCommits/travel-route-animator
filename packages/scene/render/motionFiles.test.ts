import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  addEtappe,
  addGroup,
  addTrack,
  createProject,
  MOTION_LOG_PREFIX,
  type MotionFrame,
} from '@travel-route-animator/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { baseOf, markerPng, motionCollector, writeCredits, writeMotionFiles } from './motionFiles';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tra-motion-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** A stage with two cars, one labelled, one not. */
function props() {
  const group = addGroup(createProject('Trip'), 'Tag 1');
  const stage = addEtappe(group.project, group.id, 'Algarve');
  const first = addTrack(stage.project, stage.id, 'car', { label: 'Taxi' });
  const second = addTrack(first.project, stage.id, 'car');
  return { project: second.project, etappeId: stage.id, ids: [first.id, second.id] };
}

describe('files next to a render', () => {
  it('names them after the video, a PNG sequence after its folder', () => {
    expect(baseOf('C:/out/algarve_16x9.mp4')).toBe('C:/out/algarve_16x9');
    expect(baseOf('C:/out/algarve_16x9.mov')).toBe('C:/out/algarve_16x9');
    expect(baseOf('C:/out/algarve_16x9')).toBe('C:/out/algarve_16x9');
  });

  it('writes the credits line', async () => {
    const { project, etappeId } = props();
    const path = await writeCredits({ project, etappeId }, join(dir, 'algarve'));
    expect(await readFile(path, 'utf8')).toBe(
      'OpenFreeMap © OpenMapTiles Data from OpenStreetMap\n',
    );
  });

  it('collects what the frames print and writes every format per vehicle', async () => {
    const { project, etappeId, ids } = props();
    const collector = motionCollector();
    const frame = (n: number): MotionFrame => ({
      frame: n,
      tracks: ids.map((trackId) => ({ trackId, x: 10 * n, y: 5, rotationDeg: 90, visible: true })),
    });
    collector.onBrowserLog({ text: 'something else' });
    for (const n of [1, 0])
      collector.onBrowserLog({ text: MOTION_LOG_PREFIX + JSON.stringify(frame(n)) });
    expect(collector.frames).toHaveLength(2);

    await writeMotionFiles({ project, etappeId }, join(dir, 'algarve'), collector.frames, {
      fps: 25,
      width: 1920,
      height: 1080,
      durationInFrames: 2,
    });
    expect((await readdir(dir)).sort()).toEqual([
      'algarve.car.ae.txt',
      'algarve.car.csv',
      'algarve.car.xml',
      'algarve.marker.png',
      'algarve.motion.json',
      'algarve.taxi.ae.txt',
      'algarve.taxi.csv',
      'algarve.taxi.xml',
    ]);
    const json = JSON.parse(await readFile(join(dir, 'algarve.motion.json'), 'utf8')) as {
      tracks: { name: string; samples: { x: number }[] }[];
    };
    expect(json.tracks.map((t) => t.name)).toEqual(['taxi', 'car']);
    expect(json.tracks[0]!.samples.map((s) => s.x)).toEqual([0, 10]);
  });

  it('draws the marker as a 64 × 64 RGBA PNG', () => {
    const png = markerPng();
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
    expect(png.readUInt32BE(16)).toBe(64);
    expect(png.readUInt32BE(20)).toBe(64);
    expect(png[25]).toBe(6);
  });
});
