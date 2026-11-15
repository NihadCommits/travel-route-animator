import { describe, expect, it } from 'vitest';
import { checkImage } from '../assets/imageInfo';
import { assetsOfEtappe } from '../assets/used';
import { readPhotoPlace } from '../import/exif';
import { computeFrameState } from '../frame/computeFrameState';
import type { LngLat } from '../geo/lngLat';
import type { ImageAsset } from '../model/assets';
import { validateProject } from '../model/validation';
import { refreshLocalRoutes } from '../routing/refresh';
import { trip } from '../testing/trip';
import { compileTimeline } from '../timeline/compileTimeline';
import { addPin, editPin, removePin } from './edit';
import { distanceToRoutes, pinWarnings, PIN_POP_SEC } from './pins';

/**
 * A JPEG with nothing but an EXIF segment: a little-endian TIFF whose IFD0 points to a GPS
 * directory with latitude and longitude as degrees, minutes and seconds.
 */
function jpegWithGps(
  lat: [number, number, number],
  ns: 'N' | 'S',
  lng: [number, number, number],
  ew: 'E' | 'W',
) {
  const tiff: number[] = [];
  const u16 = (v: number) => tiff.push(v & 0xff, (v >> 8) & 0xff);
  const u32 = (v: number) =>
    tiff.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
  // Header: "II", 42, offset of IFD0.
  tiff.push(0x49, 0x49);
  u16(42);
  u32(8);
  // IFD0 at 8: one entry, the GPS pointer, then "no next IFD".
  u16(1);
  u16(0x8825);
  u16(4);
  u32(1);
  u32(26);
  u32(0);
  // GPS IFD at 26: four entries.
  const rationals = 26 + 2 + 4 * 12 + 4;
  u16(4);
  const entry = (tag: number, type: number, count: number, value: number) => {
    u16(tag);
    u16(type);
    u32(count);
    u32(value);
  };
  entry(1, 2, 2, ns.charCodeAt(0));
  entry(2, 5, 3, rationals);
  entry(3, 2, 2, ew.charCodeAt(0));
  entry(4, 5, 3, rationals + 24);
  u32(0);
  for (const value of [...lat, ...lng]) {
    u32(Math.round(value * 100));
    u32(100);
  }
  const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const length = exif.length + 2;
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, length >> 8, length & 0xff, ...exif, 0xff, 0xd9]);
}

describe('readPhotoPlace', () => {
  it('reads where a photo was taken', () => {
    const place = readPhotoPlace(jpegWithGps([47, 48, 30], 'N', [13, 2, 42], 'E'));
    expect(place.lngLat![0]).toBeCloseTo(13.045, 6);
    expect(place.lngLat![1]).toBeCloseTo(47.80833, 5);
  });

  it('knows south and west, and says nothing for photos without GPS', () => {
    const place = readPhotoPlace(jpegWithGps([33, 51, 0], 'S', [70, 40, 0], 'W'));
    expect(place.lngLat![0]).toBeCloseTo(-70.6667, 4);
    expect(place.lngLat![1]).toBeCloseTo(-33.85, 4);
    expect(readPhotoPlace(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]))).toEqual({});
    expect(readPhotoPlace(Uint8Array.from([0x89, 0x50]))).toEqual({});
  });
});

describe('JPEG photos as assets', () => {
  it('are measured from their frame header', () => {
    // SOI, a tiny APP0, then SOF0 with height 300 and width 400.
    const jpeg = Uint8Array.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c,
      0x01, 0x90, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9,
    ]);
    expect(checkImage(jpeg)).toEqual({
      ok: true,
      info: { mimeType: 'image/jpeg', widthPx: 400, heightPx: 300, frameCount: 1 },
    });
  });
});

describe('pins', () => {
  const salzburg: LngLat = [13.04, 47.8];
  const hallein: LngLat = [13.1, 47.68];
  const photo: ImageAsset = {
    id: 'a_photo',
    kind: 'image',
    name: 'brücke.jpg',
    mimeType: 'image/jpeg',
    widthPx: 512,
    heightPx: 384,
    frameCount: 1,
  };

  function stage() {
    const made = trip({
      durationSec: 10,
      tracks: [
        {
          vehicle: 'bike',
          points: [
            ['Salzburg', salzburg],
            ['Hallein', hallein],
          ],
        },
      ],
    });
    return { ...made, project: refreshLocalRoutes(made.project, made.project.updatedAt) };
  }

  it('pop up as the vehicle passes, spring open and go again', () => {
    const { project, etappeId } = stage();
    // A photo halfway, right on the way.
    const middle: LngLat = [13.07, 47.74];
    const added = addPin(
      project,
      etappeId,
      { kind: 'photo', lngLat: middle, title: 'Brücke' },
      photo,
    );
    expect(validateProject(added.project).success).toBe(true);
    expect(assetsOfEtappe(added.project, etappeId).map((a) => a.id)).toEqual(['a_photo']);

    const timeline = compileTimeline(added.project, etappeId);
    const [plan] = timeline.pins;
    // Halfway along an eased trip of 10 s is at 5 s; open a quarter of 3 s before.
    expect(plan!.openSec).toBeCloseTo(5 - 0.75, 1);
    expect(plan!.closeSec - plan!.openSec).toBe(3);
    const at = (sec: number) =>
      computeFrameState(timeline, Math.round((sec + timeline.introSec) * timeline.fps)).pins;
    expect(at(plan!.openSec - 0.2)).toEqual([]);
    const opening = at(plan!.openSec + PIN_POP_SEC / 2)[0]!;
    expect(opening.scale).toBeGreaterThan(0);
    expect(opening.opacity).toBeLessThan(1);
    const open = at(plan!.openSec + 1.5)[0]!;
    expect(open).toMatchObject({ kind: 'photo', title: 'Brücke', assetId: 'a_photo', opacity: 1 });
    expect(open.scale).toBeCloseTo(1, 6);
    expect(at(plan!.closeSec + 0.1)).toEqual([]);
  });

  it('open at a set time when told so', () => {
    const { project, etappeId } = stage();
    const added = addPin(project, etappeId, {
      kind: 'place',
      lngLat: [13.07, 47.74],
      title: 'Puch',
      trigger: { mode: 'time', atSec: 2 },
    });
    const plan = compileTimeline(added.project, etappeId).pins[0]!;
    expect(plan.openSec).toBe(2);
    expect(plan.closeSec).toBe(5);
  });

  it('warn about a place far from every route, and are edited and removed', () => {
    const { project, etappeId } = stage();
    const near = addPin(project, etappeId, {
      kind: 'place',
      lngLat: [13.07, 47.741],
      title: 'Puch',
    });
    const far = addPin(near.project, etappeId, {
      kind: 'place',
      lngLat: [16.37, 48.21],
      title: 'Wien',
    });
    const etappe = () => far.project.groups[0]!.etappen[0]!;
    expect(distanceToRoutes(etappe(), [13.07, 47.741])).toBeLessThan(500);
    expect(pinWarnings(etappe())).toEqual([
      { pinId: far.id, kind: 'farFromRoute', distanceKm: expect.any(Number) as number },
    ]);
    expect(pinWarnings(etappe())[0]!.distanceKm).toBeGreaterThan(200);

    const renamed = editPin(far.project, etappeId, near.id, (pin) => ({
      ...pin,
      title: 'Puch bei Hallein',
    }));
    expect(renamed.groups[0]!.etappen[0]!.pins[0]!.title).toBe('Puch bei Hallein');
    const removed = removePin(renamed, etappeId, far.id);
    expect(removed.groups[0]!.etappen[0]!.pins.map((p) => p.id)).toEqual([near.id]);
  });
});
