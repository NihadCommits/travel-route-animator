/**
 * The files that go next to a rendered video (M13): the credits line for its description and,
 * when asked for, where every vehicle is in every frame. Node only, like the rest of render/.
 */
import { writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import {
  aeKeyframeData,
  collectMotion,
  fcp7Xml,
  filePathUrl,
  findEtappe,
  motionCsv,
  MOTION_LOG_PREFIX,
  slugify,
  type MotionClip,
  type MotionFrame,
} from '@travel-route-animator/core';
import { videoCredits } from '@travel-route-animator/styles';
import type { StageProps } from '../src/compositions/etappeProps';

export function etappeIdsOf(props: StageProps): string[] {
  return 'etappeIds' in props ? props.etappeIds : [props.etappeId];
}

/** The video's path without its extension; a PNG sequence's folder is that already. */
export function baseOf(outputLocation: string): string {
  return outputLocation.replace(/\.(mp4|mov)$/i, '');
}

/** One line with every source the video shows, for its description. */
export async function writeCredits(props: StageProps, base: string): Promise<string> {
  const credits = videoCredits(props.project, etappeIdsOf(props), {
    themes: props.themes,
    output: props.output,
    satelliteAvailable: props.serverUrl !== undefined,
  });
  const path = `${base}.credits.txt`;
  await writeFile(path, `${credits.join(' · ')}\n`, 'utf8');
  return path;
}

/** Collects the motion lines the frames print while they render (MapStage, reportMotion). */
export function motionCollector() {
  const frames: MotionFrame[] = [];
  return {
    frames,
    onBrowserLog: ({ text }: { text: string }) => {
      if (!text.startsWith(MOTION_LOG_PREFIX)) return;
      frames.push(JSON.parse(text.slice(MOTION_LOG_PREFIX.length)) as MotionFrame);
    },
  };
}

/** The vehicles of the rendered stages with a name each, unique within the video. */
function trackNames(props: StageProps): Map<string, string> {
  const names = new Map<string, string>();
  const taken = new Set<string>();
  for (const id of etappeIdsOf(props)) {
    for (const track of findEtappe(props.project, id)?.etappe.tracks ?? []) {
      const wanted = slugify(track.label?.trim() || track.vehicle.type) || 'fahrzeug';
      let name = wanted;
      for (let n = 2; taken.has(name); n++) name = `${wanted}-${n}`;
      taken.add(name);
      names.set(track.id, name);
    }
  }
  return names;
}

/** A 64 × 64 red dot on transparent ground: the stand-in clip of the Premiere XML. */
export function markerPng(): Buffer {
  const size = 64;
  const rows: number[] = [];
  for (let y = 0; y < size; y++) {
    rows.push(0); // Filter type "none" for every row.
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2);
      const alpha = Math.round(255 * Math.min(1, Math.max(0, size / 2 - 4 - d)));
      rows.push(230, 57, 70, alpha);
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA, no interlace.
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.from(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Writes the motion of every vehicle next to the video: one JSON for all, and per vehicle a
 * CSV, After Effects keyframe data and a Final Cut Pro 7 XML for Premiere. Returns the paths.
 */
export async function writeMotionFiles(
  props: StageProps,
  base: string,
  frames: readonly MotionFrame[],
  format: Omit<MotionClip, 'tracks'>,
): Promise<string[]> {
  const tracks = collectMotion(frames, trackNames(props));
  const clip: MotionClip = { ...format, tracks };
  const written: string[] = [];
  const write = async (path: string, content: string | Buffer) => {
    await writeFile(path, content);
    written.push(path);
  };
  await write(`${base}.motion.json`, JSON.stringify(clip, null, 2));
  const marker = `${base}.marker.png`;
  await write(marker, markerPng());
  for (const track of tracks) {
    await write(`${base}.${track.name}.csv`, motionCsv(track));
    await write(`${base}.${track.name}.ae.txt`, aeKeyframeData(track, format));
    await write(
      `${base}.${track.name}.xml`,
      fcp7Xml(track, format, { name: basename(marker), pathUrl: filePathUrl(marker) }),
    );
  }
  return written;
}
