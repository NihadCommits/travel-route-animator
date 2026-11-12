/**
 * Rendering a stage to a video file, in Node. Shared by `pnpm render:etappe` and the local
 * server's render jobs (M7), so that both render exactly alike. Nothing here runs in the
 * browser; the compositions themselves live in ../src.
 */
import { readdir, rename, rm, stat, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { findEtappe } from '@travel-route-animator/core';
import {
  ensureBrowser,
  renderMedia,
  renderStill,
  selectComposition,
  type CancelSignal,
  type OpenGlRenderer,
} from '@remotion/renderer';
import { ALL_FORMATS, FilePathSource, Input } from 'mediabunny';
import {
  compositionIdOf,
  type EtappeProps,
  type SequenceProps,
  type StageProps,
} from '../src/compositions/etappeProps';
import { webpackOverride } from '../webpack-override';

export type { EtappeProps, SequenceProps, StageProps };
export type { CancelSignal, OpenGlRenderer };
export { makeCancelSignal } from '@remotion/renderer';
export { GL_RENDERERS } from './gl';

const sceneRoot = join(import.meta.dirname, '..');
const repoRoot = join(sceneRoot, '../..');

export interface BundleSceneOptions {
  onProgress?: (percent: number) => void;
  /** Where the bundle goes; Remotion picks a temporary folder otherwise. */
  outDir?: string;
}

/**
 * Bundles the scene with webpack; the result is what Remotion's browser opens. The bundler
 * is loaded only here: the Windows app renders from a bundle made while packaging (M7b) and
 * does not ship webpack at all.
 */
export async function bundleScene({
  onProgress,
  outDir,
}: BundleSceneOptions = {}): Promise<string> {
  const { bundle } = await import('@remotion/bundler');
  return bundle({
    entryPoint: join(sceneRoot, 'src/index.ts'),
    webpackOverride,
    ...(onProgress && { onProgress }),
    ...(outDir && { outDir }),
  });
}

// Everything the bundle is built from: the scene, the packages it uses, and the example project
// that Remotion Studio opens (Root.tsx imports it).
const BUNDLE_SOURCES = [
  'packages/scene/src',
  'packages/core/src',
  'packages/styles/src',
  'examples',
].map((dir) => join(repoRoot, dir));

/**
 * The newest change to any file the bundle is built from. A server that keeps its bundle
 * compares this before each job and bundles again after an edit, e.g. during development.
 */
export async function bundleSourcesStamp(): Promise<number> {
  let newest = 0;
  for (const dir of BUNDLE_SOURCES) {
    const files = await readdir(dir, { recursive: true, withFileTypes: true });
    for (const file of files) {
      if (!file.isFile()) continue;
      const { mtimeMs } = await stat(join(file.parentPath, file.name));
      newest = Math.max(newest, mtimeMs);
    }
  }
  return newest;
}

/**
 * Where a video is written while it is rendered. It gets its real name only once it is
 * complete and checked, so a cancelled or crashed render never looks like a finished one.
 */
export function partialPathOf(outputLocation: string): string {
  return outputLocation.replace(/(\.[^./\\]+)?$/, '.partial$1');
}

export interface VideoInfo {
  width: number;
  height: number;
  /** Frames per second as stored in the file; null if too short to tell. */
  fps: number | null;
  durationSec: number;
}

/** Reads what a video file really is, to check a render against its settings. */
export async function probeVideo(path: string): Promise<VideoInfo> {
  const input = new Input({ formats: ALL_FORMATS, source: new FilePathSource(path) });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error(`${path} holds no video`);
    const rate = await track.computeFrameRateMetrics();
    return {
      width: await track.getDisplayWidth(),
      height: await track.getDisplayHeight(),
      fps: rate.probedPacketCount < 2 ? null : Math.round(rate.bestGuessFrameRate * 1000) / 1000,
      durationSec: await input.computeDuration(),
    };
  } finally {
    input.dispose();
  }
}

export interface RenderProgress {
  /** 0 to 1, as Remotion weighs it: drawing the frames counts 70 %, encoding 30 %. */
  progress: number;
  /** Remotion's estimate of the drawing time still needed, in milliseconds. */
  remainingMs: number;
}

export interface VideoFormat {
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
}

export interface RenderEtappeOptions {
  /** From bundleScene(); bundling once and rendering many times saves the most time. */
  serveUrl: string;
  /** One stage, or several as one video (etappeIds, ADR 0011). */
  props: StageProps;
  /** Where the finished video goes; it appears there only when complete (partialPathOf). */
  outputLocation: string;
  gl?: OpenGlRenderer;
  cancelSignal?: CancelSignal;
  /** Called once the format is known, before the first frame is drawn. */
  onFormat?: (format: VideoFormat) => void;
  onProgress?: (progress: RenderProgress) => void;
  /**
   * A Chrome Headless Shell shipped with the Windows app. Missing: Remotion downloads its own
   * on the first render.
   */
  browserExecutable?: string;
  /** Remotion's compositor (with ffmpeg) outside the app's archive, where it can be run. */
  binariesDirectory?: string;
}

export interface RenderedVideo extends VideoInfo {
  outputLocation: string;
  /** The last frame as PNG, when the last stage dives in and asks for it (M11). */
  endFrameLocation?: string;
}

/**
 * Whether the video's last frame should also come out as a PNG: the last stage ends with a
 * dive-in that asks for it, so the editor can line the footage up with it.
 */
export function wantsEndFrame(props: StageProps): boolean {
  const lastId = 'etappeIds' in props ? props.etappeIds.at(-1) : props.etappeId;
  const outro = lastId ? findEtappe(props.project, lastId)?.etappe.outro : undefined;
  return outro?.type === 'dive-in' && outro.exportEndFrame;
}

/**
 * Renders one stage to H.264 MP4 and checks the file: size and frame rate must be what the
 * project asked for. A cancelled or failed render leaves no file behind.
 */
export async function renderEtappe({
  serveUrl,
  props,
  outputLocation,
  gl = 'angle',
  cancelSignal,
  onFormat,
  onProgress,
  browserExecutable,
  binariesDirectory,
}: RenderEtappeOptions): Promise<RenderedVideo> {
  // Maps are WebGL-heavy: Remotion recommends the GPU (angle) and one browser tab at a time.
  const chromiumOptions = { gl };
  const binaries = {
    ...(browserExecutable && { browserExecutable }),
    ...(binariesDirectory && { binariesDirectory }),
  };
  // Downloads Chrome Headless Shell on the first run only, unless one is given.
  await ensureBrowser(browserExecutable ? { browserExecutable } : {});
  const composition = await selectComposition({
    serveUrl,
    id: compositionIdOf(props),
    inputProps: props,
    chromiumOptions,
    ...binaries,
  });
  const { width, height, fps, durationInFrames } = composition;
  onFormat?.({ width, height, fps, durationInFrames });

  const partial = partialPathOf(outputLocation);
  await mkdir(dirname(outputLocation), { recursive: true });
  try {
    await renderMedia({
      serveUrl,
      composition,
      inputProps: props,
      codec: 'h264',
      // Remotion 4 tags H.264 as BT.601 unless told otherwise; HD video is BT.709, which is
      // also what Premiere expects. (Remotion 5 makes this the default.)
      colorSpace: 'bt709',
      outputLocation: partial,
      chromiumOptions,
      ...binaries,
      concurrency: 1,
      // Generous because a cold tile cache can make the first frames slow.
      timeoutInMilliseconds: 60_000,
      ...(cancelSignal && { cancelSignal }),
      onProgress: ({ progress, renderEstimatedTime }) =>
        onProgress?.({ progress, remainingMs: renderEstimatedTime }),
    });
    const info = await probeVideo(partial);
    const fpsMatches = info.fps === null || Math.abs(info.fps - fps) < 0.01;
    if (info.width !== width || info.height !== height || !fpsMatches) {
      throw new Error(
        `The rendered file is ${info.width}×${info.height} at ${info.fps} fps, ` +
          `not ${width}×${height} at ${fps} fps`,
      );
    }
    await rename(partial, outputLocation);
    if (!wantsEndFrame(props)) return { outputLocation, ...info };
    // Drawn by the same composition, so it is the video's last frame without the compression.
    const endFrameLocation = outputLocation.replace(/\.[^.\\/]+$/, '') + '.png';
    await renderStill({
      serveUrl,
      composition,
      inputProps: props,
      frame: durationInFrames - 1,
      output: endFrameLocation,
      imageFormat: 'png',
      chromiumOptions,
      ...binaries,
      timeoutInMilliseconds: 60_000,
      ...(cancelSignal && { cancelSignal }),
    });
    return { outputLocation, ...info, endFrameLocation };
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
}
