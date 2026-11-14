import {
  addEtappe,
  addGroup,
  addTrack,
  addWaypoint,
  createProject,
  type Place,
  type Project,
} from '@travel-route-animator/core';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, createQueryClient } from '@/AppProviders';
import { EditorScreen } from '@/features/editor/EditorScreen';
import { installFakeServer } from '@/test/fakeServer';

// jsdom has no image decoding; the shrinking itself is the browser's job.
vi.mock('./photo', () => ({ shrinkPhoto: (file: Blob) => Promise.resolve(file) }));

/** A train from Salzburg to Hallein; its route is computed right away. */
function trip(): Project {
  const group = addGroup(createProject('Trip'), 'Tag 1');
  const stage = addEtappe(group.project, group.id, 'Salzachtal');
  const train = addTrack(stage.project, stage.id, 'train', { label: 'Zug' });
  let project = train.project;
  for (const [name, lngLat] of [
    ['Salzburg', [13.04, 47.8]],
    ['Hallein', [13.1, 47.68]],
  ] as const) {
    project = addWaypoint(project, train.id, { name, lngLat: [...lngLat] }).project;
  }
  return project;
}

const place = (id: string, name: string, lngLat: [number, number]): Place => ({
  id,
  name,
  lngLat,
  kind: 'locality',
  source: 'search',
});

/** A JPEG holding only EXIF GPS: 47° 44' N, 13° 4' 12" E, near the line. */
function photoWithGps(): Uint8Array<ArrayBuffer> {
  const tiff: number[] = [];
  const u16 = (v: number) => tiff.push(v & 0xff, v >> 8);
  const u32 = (v: number) => tiff.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, v >>> 24);
  tiff.push(0x49, 0x49);
  u16(42);
  u32(8);
  u16(1);
  [0x8825, 4].forEach(u16);
  u32(1);
  u32(26);
  u32(0);
  const rationals = 26 + 2 + 4 * 12 + 4;
  u16(4);
  for (const [tag, type, count, value] of [
    [1, 2, 2, 'N'.charCodeAt(0)],
    [2, 5, 3, rationals],
    [3, 2, 2, 'E'.charCodeAt(0)],
    [4, 5, 3, rationals + 24],
  ]) {
    u16(tag!);
    u16(type!);
    u32(count!);
    u32(value!);
  }
  u32(0);
  for (const v of [47, 44, 0, 13, 4, 12]) {
    u32(v);
    u32(1);
  }
  const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0, exif.length + 2, ...exif, 0xff, 0xd9]);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

async function open(project: Project, places: Place[] = []) {
  const server = installFakeServer([project], { places: () => places });
  render(
    <AppProviders queryClient={createQueryClient()}>
      <EditorScreen projectId={project.id} />
    </AppProviders>,
  );
  await screen.findByRole('heading', { level: 1, name: project.name });
  const row = await screen.findByRole('treeitem', { name: 'Salzachtal' });
  act(() => row.focus());
  const section = within(await screen.findByRole('region', { name: 'Fotos und Orte' }));
  return { server, section, user: userEvent.setup() };
}

describe('photos and places', () => {
  it('finds the place on the way before the one of the same name far off', async () => {
    const { section, user } = await open(trip(), [
      place('far', 'Puch', [15.65, 47.25]),
      place('near', 'Puch', [13.087, 47.72]),
    ]);
    // Focus without a click: jsdom's zero-size panels would take the click (EditorScreen.test).
    act(() => section.getByLabelText('Ort hinzufügen').focus());
    await user.keyboard('Puch');
    const results = within(await section.findByRole('list', { name: 'Gefundene Orte' }));
    const [first, second] = results.getAllByRole('button');
    expect(first).toHaveTextContent(/Puch.*km von der Route/);
    expect(second).toHaveTextContent(/⚠ \d+ km weg/);

    await user.click(first!);
    expect(await section.findByDisplayValue('Puch')).toBeInTheDocument();
    expect(section.queryByRole('alert')).not.toBeInTheDocument();
    await user.selectOptions(section.getByLabelText('Geht auf'), 'Zu fester Zeit');
    expect(section.getByLabelText('Ab')).toHaveValue('0');
  });

  it('places a photo where it was taken and uploads it as an asset', async () => {
    const { server, section, user } = await open(trip());
    const file = new File([photoWithGps()], 'Bruecke.jpg', { type: 'image/jpeg' });
    await user.upload(section.getByLabelText('Foto (JPEG mit GPS)'), file);

    expect(await section.findByDisplayValue('Bruecke')).toBeInTheDocument();
    await waitFor(() =>
      expect(server.calls.some((call) => call.path.includes('/assets'))).toBe(true),
    );
    const saved = await waitFor(() => {
      const stored = server.projects.get(trip().id) ?? [...server.projects.values()][0]!;
      const pin = stored.groups[0]!.etappen[0]!.pins[0];
      if (!pin) throw new Error('not saved yet');
      return pin;
    });
    expect(saved.kind).toBe('photo');
    expect(saved.lngLat[0]).toBeCloseTo(13.07, 6);
    expect(saved.lngLat[1]).toBeCloseTo(47.7333, 4);
    expect(saved.assetId).toBeDefined();
  });
});
