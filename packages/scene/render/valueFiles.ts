/**
 * The overlay blocks' values next to a rendered video (M18), for the edit: SRT per block for
 * Premiere Pro and DaVinci Resolve, CSV and JSON for scripts, MGJSON for After Effects and a
 * Fusion setting for Resolve's Fusion page. Worked out from the timeline alone, in Node.
 */
import { writeFile } from 'node:fs/promises';
import {
  blocksOf,
  compileSequence,
  fusionSettingOf,
  mgjsonOf,
  srtOf,
  valuesCsv,
  valuesJson,
  valueTracksOf,
  type NamedBlock,
} from '@travel-route-animator/core';
import type { StageProps } from '../src/compositions/etappeProps';
import { etappeIdsOf } from './motionFiles';

/** The stages of the video as the render compiles them, with the render's output settings. */
function sequenceOf(props: StageProps) {
  return compileSequence(props.project, etappeIdsOf(props), {
    ...(props.output && { output: props.output }),
  });
}

/** Every block of the video with the name its files get. */
export function namedBlocks(props: StageProps): NamedBlock[] {
  return blocksOf(props.project, sequenceOf(props));
}

/** Writes the values of every block next to the video; returns the paths. */
export async function writeValueFiles(props: StageProps, base: string): Promise<string[]> {
  const values = valueTracksOf(props.project, sequenceOf(props));
  const written: string[] = [];
  const write = async (path: string, content: string | undefined) => {
    if (content === undefined) return;
    await writeFile(path, content, 'utf8');
    written.push(path);
  };
  await write(`${base}.values.csv`, valuesCsv(values));
  await write(`${base}.values.json`, valuesJson(values));
  if (values.tracks.length > 0) {
    await write(`${base}.values.mgjson`, mgjsonOf(values));
    await write(`${base}.values.setting`, fusionSettingOf(values));
  }
  for (const track of values.tracks) {
    await write(`${base}.${track.name}.srt`, srtOf(track, values.fps));
  }
  return written;
}
