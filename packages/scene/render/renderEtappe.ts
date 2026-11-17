/**
 * Rendering a stage to a video file, in Node. Shared by `pnpm render:etappe` and the local
 * server's render jobs (M7), so that both render exactly alike. Nothing here runs in the
 * browser; the compositions themselves live in ../src.
 */
import { readdir, readFile, rename, rm, stat, mkdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { findEtappe, resolveOutput, type Codec } from '@travel-route-animator/core';
import {
  ensureBrowser,
  renderFrames,
  renderMedia,
  renderStill,
  selectComposition,
  type CancelSignal,
  type OpenGlRenderer,
  type RenderMediaOptions,
} from '@remotion/renderer';
import { ALL_FORMATS, FilePathSource, Input } from 'mediabunny';
import {
  compositionIdOf,
  type EtappeProps,
  type SequenceProps,
  type StageProps,
} from '../src/compositions/etappeProps';
import { webpackOverride } from '../webpack-override';
import { baseOf, motionCollector, writeCredits, writeMotionFiles } from './motionFiles';
import { namedBlocks, writeValueFiles } from './valueFiles';

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

/** The size of a PNG, from its header: 8 bytes signature, then the IHDR chunk. */
async function pngSize(path: string): Promise<{ width: number; height: number }> {
  const header = (await readFile(path)).subarray(0, 24);
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
}

/**
 * Remotion's settings per codec (ARCHITEKTUR: Codec-Einstellungen). ProRes 4444 gets its
 * frames as PNG and keeps their alpha channel in a 10-bit 4:4:4 picture with alpha.
 */
function encodingOf(
  codec: Exclude<Codec, 'png-sequence'>,
): Pick<RenderMediaOptions, 'codec' | 'proResProfile' | 'imageFormat' | 'pixelFormat'> {
  if (codec === 'h264') return { codec: 'h264' };
  if (codec === 'prores-422hq') return { codec: 'prores', proResProfile: 'hq' };
  return {
    codec: 'prores',
    proResProfile: '4444',
    imageFormat: 'png',
    pixelFormat: 'yuva444p10le',
  };
}

type MotionCollector = ReturnType<typeof motionCollector>;

/**
 * What goes next to a finished render: always the credits line, the motion of every vehicle
 * when the render collected it (M13), and the blocks' values when asked for (M18). A block's
 * own video gets none of it; its main video has it all.
 */
async function writeExtras(
  props: StageProps,
  outputLocation: string,
  motion: MotionCollector | undefined,
  format: VideoFormat,
): Promise<void> {
  if (props.isolateWidgetId !== undefined) return;
  const base = baseOf(outputLocation);
  await writeCredits(props, base);
  if (motion) await writeMotionFiles(props, base, motion.frames, format);
  if (props.editValues) await writeValueFiles(props, base);
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
  if (props.isolateWidgetId !== undefined) return false;
  const lastId = 'etappeIds' in props ? props.etappeIds.at(-1) : props.etappeId;
  const outro = lastId ? findEtappe(props.project, lastId)?.etappe.outro : undefined;
  return outro?.type === 'dive-in' && outro.exportEndFrame;
}

/** How long a block's own video takes next to the main video: no map, so far less. */
const BLOCK_VIDEO_WEIGHT = 0.25;

/**
 * Renders a stage to a video (H.264 MP4 or ProRes MOV) or to a folder of PNGs, and checks
 * the result: size and frame rate (or the number of pictures) must be what the project asked
 * for. A cancelled or failed render leaves nothing behind. Asked for (M18), every overlay block
 * then also comes as a transparent video of its own next to it: "<name>.<block>.mov", or a
 * PNG folder when the main video is one, each the full picture with the block where it stands.
 */
export async function renderEtappe(options: RenderEtappeOptions): Promise<RenderedVideo> {
  const { props, outputLocation, onProgress } = options;
  if (!props.blockVideos || props.isolateWidgetId !== undefined) return renderOne(options);
  const blocks = namedBlocks(props);
  const total = 1 + BLOCK_VIDEO_WEIGHT * blocks.length;
  let done = 0;
  // The share of the whole job, and the time left from the pace so far.
  const scaled = (weight: number) => (step: RenderProgress) => {
    const progress = (done + step.progress * weight) / total;
    const rate = step.progress > 0 ? step.remainingMs / ((1 - step.progress) * weight || 1) : 0;
    onProgress?.({
      progress,
      remainingMs: Math.round(rate * (total - done - step.progress * weight)),
    });
  };
  const main = await renderOne({ ...options, onProgress: scaled(1) });
  done = 1;
  const pictures = resolveOutput(props.project, props.output).codec === 'png-sequence';
  const base = baseOf(outputLocation);
  for (const block of blocks) {
    await renderOne({
      ...options,
      props: {
        ...props,
        isolateWidgetId: block.widget.id,
        blockVideos: false,
        motionData: false,
        editValues: false,
        output: {
          ...props.output,
          codec: pictures ? 'png-sequence' : 'prores-4444',
          transparentOverlay: true,
        },
      },
      outputLocation: pictures ? `${base}.${block.name}` : `${base}.${block.name}.mov`,
      onProgress: scaled(BLOCK_VIDEO_WEIGHT),
    });
    done += BLOCK_VIDEO_WEIGHT;
  }
  return main;
}

/** One video: the main one, or one block's own. */
async function renderOne({
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
  const { codec } = resolveOutput(props.project, props.output);
  // The frames report where the vehicles are (MapStage); the console carries it to Node.
  const motion = props.motionData ? motionCollector() : undefined;
  if (codec === 'png-sequence') {
    return renderPngSequence({
      motion,
      serveUrl,
      props,
      composition,
      outputLocation,
      partial,
      chromiumOptions,
      binaries,
      cancelSignal,
      onProgress,
    });
  }
  try {
    await renderMedia({
      serveUrl,
      composition,
      inputProps: props,
      ...encodingOf(codec),
      // Remotion 4 tags video as BT.601 unless told otherwise; HD video is BT.709, which is
      // also what Premiere expects. (Remotion 5 makes this the default.)
      colorSpace: 'bt709',
      outputLocation: partial,
      chromiumOptions,
      ...binaries,
      ...(motion && { onBrowserLog: motion.onBrowserLog }),
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
    await writeExtras(props, outputLocation, motion, { width, height, fps, durationInFrames });
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

type Composition = Awaited<ReturnType<typeof selectComposition>>;

interface PngSequenceJob {
  serveUrl: string;
  props: StageProps;
  composition: Composition;
  outputLocation: string;
  partial: string;
  chromiumOptions: { gl: OpenGlRenderer };
  binaries: { browserExecutable?: string; binariesDirectory?: string };
  cancelSignal: CancelSignal | undefined;
  onProgress: ((progress: RenderProgress) => void) | undefined;
  motion: MotionCollector | undefined;
}

/**
 * One PNG per frame in a folder named like the video would be, with alpha: "<name>_0000.png"
 * and up. Premiere and After Effects read it as an image sequence. Like a video, the folder
 * gets its real name only once every picture is there.
 */
async function renderPngSequence({
  serveUrl,
  props,
  composition,
  outputLocation,
  partial,
  chromiumOptions,
  binaries,
  cancelSignal,
  onProgress,
  motion,
}: PngSequenceJob): Promise<RenderedVideo> {
  const { width, height, fps, durationInFrames } = composition;
  const name = basename(outputLocation);
  await rm(partial, { recursive: true, force: true });
  const startedAt = performance.now();
  try {
    await renderFrames({
      serveUrl,
      composition,
      inputProps: props,
      outputDir: partial,
      imageFormat: 'png',
      imageSequencePattern: `${name}_[frame].[ext]`,
      chromiumOptions,
      ...(binaries.browserExecutable && { browserExecutable: binaries.browserExecutable }),
      ...(binaries.binariesDirectory && { binariesDirectory: binaries.binariesDirectory }),
      concurrency: 1,
      timeoutInMilliseconds: 60_000,
      ...(cancelSignal && { cancelSignal }),
      ...(motion && { onBrowserLog: motion.onBrowserLog }),
      onStart: () => undefined,
      onFrameUpdate: (rendered) => {
        // Drawing is all there is: no encoding step, so progress is the share of frames.
        const elapsed = performance.now() - startedAt;
        onProgress?.({
          progress: rendered / durationInFrames,
          remainingMs: (elapsed / Math.max(1, rendered)) * (durationInFrames - rendered),
        });
      },
    });
    const pictures = (await readdir(partial)).filter((file) => file.endsWith('.png')).sort();
    const first = pictures[0];
    const size = first ? await pngSize(join(partial, first)) : { width: 0, height: 0 };
    if (pictures.length !== durationInFrames || size.width !== width || size.height !== height) {
      throw new Error(
        `The sequence has ${pictures.length} pictures of ${size.width}×${size.height}, ` +
          `not ${durationInFrames} of ${width}×${height}`,
      );
    }
    await rm(outputLocation, { recursive: true, force: true });
    await rename(partial, outputLocation);
    await writeExtras(props, outputLocation, motion, { width, height, fps, durationInFrames });
    return { outputLocation, width, height, fps, durationSec: durationInFrames / fps };
  } catch (error) {
    await rm(partial, { recursive: true, force: true });
    throw error;
  }
}
