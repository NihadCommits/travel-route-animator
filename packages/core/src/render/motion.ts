// Where each vehicle is in the picture, frame by frame (M13): for adding own icons later in
// After Effects or Premiere. The scene measures the pixels while it renders (map.project and
// the 3D layer's own matrices); these functions only turn them into files.

/** One vehicle in one frame, in pixels of the finished video. */
export interface MotionSample {
  frame: number;
  /** Top left is 0, 0. */
  x: number;
  y: number;
  /** Clockwise from straight up, in degrees, as the vehicle points on screen. */
  rotationDeg: number;
  /** In the picture and drawn. */
  visible: boolean;
}

export interface MotionTrack {
  trackId: string;
  /** For file names and the editor: the track's label or its vehicle. */
  name: string;
  samples: MotionSample[];
}

export interface MotionClip {
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  tracks: MotionTrack[];
}

/** What a frame reports from the browser: the samples of every vehicle in it. */
export interface MotionFrame {
  frame: number;
  tracks: { trackId: string; x: number; y: number; rotationDeg: number; visible: boolean }[];
}

/** The prefix of the console line a rendering frame reports its motion with. */
export const MOTION_LOG_PREFIX = 'TRA_MOTION ';

/** Gathers the frames' reports per vehicle, frame by frame; a frame reported twice counts once. */
export function collectMotion(
  frames: readonly MotionFrame[],
  names: ReadonlyMap<string, string>,
): MotionTrack[] {
  const byFrame = new Map(frames.map((frame) => [frame.frame, frame]));
  const ordered = [...byFrame.values()].sort((a, b) => a.frame - b.frame);
  return [...names].map(([trackId, name]) => {
    const samples = ordered.flatMap(({ frame, tracks }) => {
      const found = tracks.find((track) => track.trackId === trackId);
      return found ? [{ frame, ...withoutId(found) }] : [];
    });
    return { trackId, name, samples: unwrapRotation(samples) };
  });
}

function withoutId({ trackId: _id, ...rest }: MotionFrame['tracks'][number]) {
  return rest;
}

/**
 * Rotation without jumps: 359° followed by 1° becomes 361°, so an editing program turns the
 * short way instead of spinning backwards once around.
 */
export function unwrapRotation(samples: readonly MotionSample[]): MotionSample[] {
  let previous: number | undefined;
  return samples.map((sample) => {
    let rotation = sample.rotationDeg;
    if (previous !== undefined) {
      while (rotation - previous > 180) rotation -= 360;
      while (rotation - previous < -180) rotation += 360;
    }
    previous = rotation;
    return { ...sample, rotationDeg: rotation };
  });
}

const round = (value: number, digits = 2) => Number(value.toFixed(digits));

/** Frame, x, y, rotation and visibility per line, for spreadsheets and scripts. */
export function motionCsv(track: MotionTrack): string {
  const lines = track.samples.map(
    (s) => `${s.frame},${round(s.x)},${round(s.y)},${round(s.rotationDeg)},${s.visible ? 1 : 0}`,
  );
  return ['frame,x,y,rotation_deg,visible', ...lines].join('\n') + '\n';
}

/**
 * "Adobe After Effects Keyframe Data": the text Mocha and other trackers put on the clipboard.
 * Copied and pasted onto a layer in After Effects, it sets Position, Rotation and Opacity per
 * frame. Tabs and the empty lines are part of the format.
 */
export function aeKeyframeData(track: MotionTrack, clip: Omit<MotionClip, 'tracks'>): string {
  const rows = (render: (s: MotionSample) => string) =>
    track.samples.map((s) => `\t${s.frame}\t${render(s)}\t`);
  return [
    'Adobe After Effects 8.0 Keyframe Data',
    '',
    `\tUnits Per Second\t${clip.fps}`,
    `\tSource Width\t${clip.width}`,
    `\tSource Height\t${clip.height}`,
    '\tSource Pixel Aspect Ratio\t1',
    '\tComp Pixel Aspect Ratio\t1',
    '',
    'Transform\tPosition',
    '\tFrame\tX pixels\tY pixels\tZ pixels\t',
    ...rows((s) => `${round(s.x, 3)}\t${round(s.y, 3)}\t0`),
    '',
    'Transform\tRotation',
    '\tFrame\tdegrees\t',
    ...rows((s) => `${round(s.rotationDeg, 3)}`),
    '',
    'Transform\tOpacity',
    '\tFrame\tpercent\t',
    ...rows((s) => (s.visible ? '100' : '0')),
    '',
    '',
    'End of Keyframe Data',
    '',
  ].join('\r\n');
}

const escapeXml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * A Final Cut Pro 7 XML (xmeml 4) that Premiere imports as a sequence: one clip of a marker
 * image whose Motion center and rotation follow the vehicle frame by frame.
 *
 * A spike (M13 plan): FCP 7 measures the center from the middle of the frame, in shares of
 * the frame's width and height (−0.5 to 0.5). Whether Premiere reads it like that has to be
 * tried with Nihad's Premiere version.
 */
export function fcp7Xml(
  track: MotionTrack,
  clip: Omit<MotionClip, 'tracks'>,
  marker: { name: string; pathUrl: string },
): string {
  const { fps, width, height, durationInFrames } = clip;
  const keyframes = (value: (s: MotionSample) => string) =>
    track.samples
      .map((s) => `<keyframe><when>${s.frame}</when>${value(s)}</keyframe>`)
      .join('\n              ');
  const center = keyframes(
    (s) =>
      `<value><horiz>${round((s.x - width / 2) / width, 6)}</horiz><vert>${round((s.y - height / 2) / height, 6)}</vert></value>`,
  );
  const rotation = keyframes((s) => `<value>${round(s.rotationDeg, 3)}</value>`);
  const opacity = keyframes((s) => `<value>${s.visible ? 100 : 0}</value>`);
  const rate = `<rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>`;
  const name = escapeXml(track.name);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
  <sequence>
    <name>${name}</name>
    <duration>${durationInFrames}</duration>
    ${rate}
    <media>
      <video>
        <format>
          <samplecharacteristics>
            ${rate}
            <width>${width}</width>
            <height>${height}</height>
            <pixelaspectratio>square</pixelaspectratio>
          </samplecharacteristics>
        </format>
        <track>
          <clipitem id="${escapeXml(track.trackId)}">
            <name>${name}</name>
            <duration>${durationInFrames}</duration>
            ${rate}
            <start>0</start>
            <end>${durationInFrames}</end>
            <in>0</in>
            <out>${durationInFrames}</out>
            <file id="marker">
              <name>${escapeXml(marker.name)}</name>
              <pathurl>${escapeXml(marker.pathUrl)}</pathurl>
              ${rate}
              <duration>${durationInFrames}</duration>
              <media><video><samplecharacteristics><width>64</width><height>64</height></samplecharacteristics></video></media>
            </file>
            <filter>
              <effect>
                <name>Basic Motion</name>
                <effectid>basic</effectid>
                <effectcategory>motion</effectcategory>
                <effecttype>motion</effecttype>
                <mediatype>video</mediatype>
                <parameter>
                  <parameterid>center</parameterid>
                  <name>Center</name>
                  ${center}
                </parameter>
                <parameter>
                  <parameterid>rotation</parameterid>
                  <name>Rotation</name>
                  <valuemin>-8640</valuemin>
                  <valuemax>8640</valuemax>
                  ${rotation}
                </parameter>
              </effect>
            </filter>
            <filter>
              <effect>
                <name>Opacity</name>
                <effectid>opacity</effectid>
                <effectcategory>motion</effectcategory>
                <effecttype>motion</effecttype>
                <mediatype>video</mediatype>
                <parameter>
                  <parameterid>opacity</parameterid>
                  <name>opacity</name>
                  <valuemin>0</valuemin>
                  <valuemax>100</valuemax>
                  ${opacity}
                </parameter>
              </effect>
            </filter>
          </clipitem>
        </track>
      </video>
    </media>
  </sequence>
</xmeml>
`;
}

/** A file URL as FCP 7 XML wants it: file://localhost/C:/path/with%20spaces. */
export function filePathUrl(path: string): string {
  const slashed = path.replace(/\\/g, '/');
  const absolute = slashed.startsWith('/') ? slashed : `/${slashed}`;
  return `file://localhost${encodeURI(absolute)}`;
}
