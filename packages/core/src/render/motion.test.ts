import { describe, expect, it } from 'vitest';
import {
  aeKeyframeData,
  collectMotion,
  fcp7Xml,
  filePathUrl,
  motionCsv,
  unwrapRotation,
  type MotionFrame,
  type MotionTrack,
} from './motion';

const clip = { fps: 25, width: 1920, height: 1080, durationInFrames: 3 };

const frames: MotionFrame[] = [
  { frame: 1, tracks: [{ trackId: 't_car', x: 970.256, y: 540, rotationDeg: 359, visible: true }] },
  { frame: 0, tracks: [{ trackId: 't_car', x: 960, y: 540, rotationDeg: 350, visible: true }] },
  // Rendered twice (a retry): counts once.
  { frame: 1, tracks: [{ trackId: 't_car', x: 970.256, y: 540, rotationDeg: 359, visible: true }] },
  { frame: 2, tracks: [{ trackId: 't_car', x: 2100, y: 530, rotationDeg: 3, visible: false }] },
];

describe('collectMotion', () => {
  it('orders the frames per vehicle and turns the short way', () => {
    const [car] = collectMotion(frames, new Map([['t_car', 'Auto']]));
    expect(car!.name).toBe('Auto');
    expect(car!.samples.map((s) => s.frame)).toEqual([0, 1, 2]);
    // 359° → 3° is 4° on, not 356° back.
    expect(car!.samples.map((s) => s.rotationDeg)).toEqual([350, 359, 363]);
  });

  it('unwraps both ways', () => {
    const turn = (rotationDeg: number) => ({ frame: 0, x: 0, y: 0, rotationDeg, visible: true });
    expect(unwrapRotation([turn(10), turn(350), turn(20)]).map((s) => s.rotationDeg)).toEqual([
      10, -10, 20,
    ]);
  });
});

describe('motion files', () => {
  const car: MotionTrack = collectMotion(frames, new Map([['t_car', 'Auto & Co']]))[0]!;

  it('writes a CSV per vehicle', () => {
    expect(motionCsv(car)).toBe(
      'frame,x,y,rotation_deg,visible\n0,960,540,350,1\n1,970.26,540,359,1\n2,2100,530,363,0\n',
    );
  });

  it('writes After Effects keyframe data with tabs, CRLF and the end marker', () => {
    const text = aeKeyframeData(car, clip);
    const lines = text.split('\r\n');
    expect(lines[0]).toBe('Adobe After Effects 8.0 Keyframe Data');
    expect(lines).toContain('\tUnits Per Second\t25');
    expect(lines).toContain('Transform\tPosition');
    expect(lines).toContain('\t1\t970.256\t540\t0\t');
    expect(lines).toContain('\t2\t363\t');
    expect(lines).toContain('\t2\t0\t');
    expect(lines.at(-2)).toBe('End of Keyframe Data');
  });

  it('writes a Final Cut Pro 7 XML with the center from the middle in shares of the frame', () => {
    const xml = fcp7Xml(car, clip, {
      name: 'marker.png',
      pathUrl: filePathUrl('C:\\Videos\\Mein Trip\\marker.png'),
    });
    expect(xml).toContain('<xmeml version="4">');
    expect(xml).toContain('<name>Auto &amp; Co</name>');
    expect(xml).toContain('<pathurl>file://localhost/C:/Videos/Mein%20Trip/marker.png</pathurl>');
    // Frame 0 sits in the middle; x = 2100 lies right of the frame (> 0.5).
    expect(xml).toContain('<when>0</when><value><horiz>0</horiz><vert>0</vert></value>');
    expect(xml).toContain('<horiz>0.59375</horiz>');
    expect(xml).toContain('<when>2</when><value>0</value>');
  });
});
