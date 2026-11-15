import { deflateRawSync, gunzipSync, gzipSync, inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { writeFit, type FitTestPoint } from '../testing/fitWriter';
import { isZip, parseTrackBytes, unpackTrackFile, zipEntries, type Unpacker } from './archive';
import { isFit, parseFit } from './fit';
import { ImportError, parseGpx, parseTcx, parseTrackFile } from './parse';

// The files watches and apps export (M16): GPX with heart rate, TCX, FIT, and the archives
// Garmin Connect and Strava hand them out in.

const START_S = Date.UTC(2026, 6, 14, 6, 30) / 1000;

/** A short hike: 6 points a minute apart, climbing, with heart rate and cadence. */
function hike(): FitTestPoint[] {
  return Array.from({ length: 6 }, (_, i) => ({
    timeS: START_S + i * 60,
    lat: 47.5 + i * 0.001,
    lng: 13.1 + i * 0.0005,
    ele: 800 + i * 12.4,
    hr: 110 + i * 5,
    cad: 52 + i,
  }));
}

describe('GPX with sensors', () => {
  it('reads heart rate and cadence from Garmin TrackPointExtension', () => {
    const gpx = `<gpx xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"><trk><trkseg>
      <trkpt lat="47.5" lon="13.1"><time>2026-07-14T06:30:00Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>121</gpxtpx:hr><gpxtpx:cad>80</gpxtpx:cad></gpxtpx:TrackPointExtension></extensions></trkpt>
      <trkpt lat="47.501" lon="13.1"><time>2026-07-14T06:30:05Z</time></trkpt>
    </trkseg></trk></gpx>`;
    const [first, second] = parseGpx(gpx, 'walk.gpx').points;
    expect(first).toMatchObject({ hr: 121, cad: 80, time: Date.UTC(2026, 6, 14, 6, 30) });
    expect(second).not.toHaveProperty('hr');
  });
});

describe('TCX', () => {
  const tcx = (sport: string) => `<?xml version="1.0"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities><Activity Sport="${sport}"><Id>2026-07-14T06:30:00Z</Id><Lap StartTime="2026-07-14T06:30:00Z"><Track>
    <Trackpoint><Time>2026-07-14T06:30:00Z</Time><Position><LatitudeDegrees>47.5</LatitudeDegrees><LongitudeDegrees>13.1</LongitudeDegrees></Position><AltitudeMeters>800.4</AltitudeMeters><HeartRateBpm><Value>118</Value></HeartRateBpm><Cadence>84</Cadence></Trackpoint>
    <Trackpoint><Time>2026-07-14T06:30:10Z</Time></Trackpoint>
    <Trackpoint><Time>2026-07-14T06:30:20Z</Time><Position><LatitudeDegrees>47.502</LatitudeDegrees><LongitudeDegrees>13.101</LongitudeDegrees></Position><AltitudeMeters>806</AltitudeMeters><HeartRateBpm><Value>126</Value></HeartRateBpm></Trackpoint>
  </Track></Lap></Activity></Activities>
</TrainingCenterDatabase>`;

  it('reads position, time, height, heart rate and the sport, and skips points without GPS', () => {
    const data = parseTcx(tcx('Biking'), 'Morning_Ride.tcx');
    expect(data).toMatchObject({ source: 'tcx', name: 'Morning_Ride', activity: 'Biking' });
    expect(data.points).toHaveLength(2);
    expect(data.points[0]).toEqual({
      lngLat: [13.1, 47.5],
      ele: 800.4,
      time: Date.UTC(2026, 6, 14, 6, 30),
      hr: 118,
      cad: 84,
    });
    expect(data.points[1]).toMatchObject({ hr: 126 });
  });

  it('is found by its name or its content, and "Other" is no activity', () => {
    expect(parseTrackFile(tcx('Other'), 'export.xml')).not.toHaveProperty('activity');
    expect(() => parseTcx('<gpx></gpx>', 'x.tcx')).toThrow(ImportError);
  });
});

describe('FIT', () => {
  it('reads the records of an activity like a watch writes them', () => {
    const bytes = writeFit(hike(), { sport: 17 });
    expect(isFit(bytes)).toBe(true);
    const data = parseFit(bytes, 'Wanderung.fit');
    expect(data).toMatchObject({ source: 'fit', name: 'Wanderung', activity: 'hiking' });
    expect(data.points).toHaveLength(6);
    const [first, , third] = data.points;
    expect(first!.lngLat[0]).toBeCloseTo(13.1, 6);
    expect(first!.lngLat[1]).toBeCloseTo(47.5, 6);
    expect(first).toMatchObject({ ele: 800, time: START_S * 1000, hr: 110, cad: 52 });
    expect(third!.ele).toBeCloseTo(824.8, 1);
  });

  it('reads big-endian records, skips developer fields and follows compressed timestamps', () => {
    // Compressed headers only carry 5 bits of seconds, so watches use them below 32 s apart.
    const everyTen = hike().map((p, i) => ({ ...p, timeS: START_S + i * 10 }));
    const cases = [
      { points: hike(), options: { bigEndian: true } },
      { points: hike(), options: { developerField: true } },
      { points: everyTen, options: { compressTimestamps: true } },
    ];
    for (const { points, options } of cases) {
      const data = parseFit(writeFit(points, options), 'x.fit');
      expect(data.points.map((p) => p.time)).toEqual(points.map((p) => p.timeS * 1000));
      expect(data.points.map((p) => p.hr)).toEqual(points.map((p) => p.hr));
    }
  });

  it('leaves out what the sensors did not measure', () => {
    const points = hike().map((p, i) => (i === 2 ? { ...p, hr: undefined, ele: undefined } : p));
    const third = parseFit(writeFit(points), 'x.fit').points[2]!;
    expect(third).not.toHaveProperty('hr');
    expect(third).not.toHaveProperty('ele');
  });

  it('says what is wrong with files it cannot use', () => {
    expect(() => parseFit(new Uint8Array(20), 'x.fit')).toThrow('not a FIT file');
    expect(() => parseFit(writeFit(hike().slice(0, 1)), 'x.fit')).toThrow('no track');
    const truncated = writeFit(hike()).slice(0, 60);
    expect(() => parseFit(truncated, 'x.fit')).toThrow(ImportError);
  });
});

/** A ZIP archive with these files, deflated like Garmin Connect packs them. */
function zip(files: { name: string; data: Uint8Array; store?: boolean }[]): Uint8Array {
  const out: number[] = [];
  const central: number[] = [];
  const u16 = (v: number) => [v & 0xff, (v >> 8) & 0xff];
  const u32 = (v: number) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff];
  for (const file of files) {
    const name = [...new TextEncoder().encode(file.name)];
    const packed = file.store ? file.data : new Uint8Array(deflateRawSync(file.data));
    const method = file.store ? 0 : 8;
    const offset = out.length;
    out.push(...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(method), ...u16(0), ...u16(0));
    out.push(...u32(0), ...u32(packed.length), ...u32(file.data.length));
    out.push(...u16(name.length), ...u16(0), ...name, ...packed);
    central.push(...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(method));
    central.push(...u16(0), ...u16(0), ...u32(0), ...u32(packed.length), ...u32(file.data.length));
    central.push(...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0));
    central.push(...u32(offset), ...name);
  }
  const centralStart = out.length;
  out.push(...central);
  out.push(...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length));
  out.push(...u32(central.length), ...u32(centralStart), ...u16(0));
  return new Uint8Array(out);
}

const node: Unpacker = {
  inflateRaw: (data) => Promise.resolve(new Uint8Array(inflateRawSync(data))),
  gunzip: (data) => Promise.resolve(new Uint8Array(gunzipSync(data))),
};

describe('archives', () => {
  it('finds the FIT file in a Garmin "Export Original" ZIP', async () => {
    const fit = writeFit(hike(), { sport: 2 });
    const archive = zip([
      { name: 'readme.txt', data: new TextEncoder().encode('hi'), store: true },
      { name: '12345678901_ACTIVITY.fit', data: fit },
    ]);
    expect(isZip(archive)).toBe(true);
    expect(zipEntries(archive).map((entry) => entry.name)).toEqual([
      'readme.txt',
      '12345678901_ACTIVITY.fit',
    ]);
    const file = await unpackTrackFile(archive, 'download.zip', node);
    expect(file.fileName).toBe('12345678901_ACTIVITY.fit');
    expect(parseTrackBytes(file.bytes, file.fileName).activity).toBe('cycling');
  });

  it("unpacks a gzipped FIT file from Strava's archive and reads GPX as text", async () => {
    const file = await unpackTrackFile(
      new Uint8Array(gzipSync(writeFit(hike()))),
      'ride.fit.gz',
      node,
    );
    expect(file.fileName).toBe('ride.fit');
    expect(parseTrackBytes(file.bytes, file.fileName).points).toHaveLength(6);
    const gpx =
      '<gpx><trk><trkseg><trkpt lat="1" lon="2"/><trkpt lat="1.1" lon="2"/></trkseg></trk></gpx>';
    expect(parseTrackBytes(new TextEncoder().encode(gpx), 'a.gpx').source).toBe('gpx');
  });

  it('says so when an archive holds no track or is not unpacked', async () => {
    const empty = zip([{ name: 'notes.txt', data: new TextEncoder().encode('x'), store: true }]);
    await expect(unpackTrackFile(empty, 'x.zip', node)).rejects.toThrow('no GPX, TCX, FIT');
    expect(() => parseTrackBytes(empty, 'x.zip')).toThrow('Unpack');
    expect(() => zipEntries(new Uint8Array(30))).toThrow('not a ZIP');
  });
});
