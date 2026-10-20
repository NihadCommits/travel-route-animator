/**
 * M0 spike: renders the Salzburg → Vienna test animation to MP4 and reports how long it took.
 *
 *   pnpm spike:render                    both compositions with the GPU (gl=angle)
 *   pnpm spike:render --gl=vulkan        try another OpenGL backend
 *   pnpm spike:render --only=SpikeGlobe  render a single composition
 */
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { bundle } from '@remotion/bundler';
import {
  ensureBrowser,
  renderMedia,
  selectComposition,
  type ChromiumOptions,
  type OpenGlRenderer,
} from '@remotion/renderer';
import { webpackOverride } from '../webpack-override';

const COMPOSITIONS = ['SpikeFlat', 'SpikeGlobe'];
const GL_RENDERERS: readonly OpenGlRenderer[] = [
  'angle',
  'angle-egl',
  'egl',
  'swangle',
  'swiftshader',
  'vulkan',
];

const { values } = parseArgs({
  options: {
    gl: { type: 'string', default: 'angle' },
    only: { type: 'string' },
  },
});

const gl = GL_RENDERERS.find((renderer) => renderer === values.gl);
if (!gl) {
  throw new Error(`Unknown --gl value "${values.gl}". Use one of: ${GL_RENDERERS.join(', ')}`);
}
const ids = values.only ? [values.only] : COMPOSITIONS;

const packageRoot = resolve(import.meta.dirname, '..');
const outputDir = resolve(packageRoot, '../../output/spike');
// Maps are WebGL-heavy: Remotion recommends the GPU (angle) and one browser tab at a time.
const chromiumOptions: ChromiumOptions = { gl };

await mkdir(outputDir, { recursive: true });
// Downloads Chrome Headless Shell on the first run only.
await ensureBrowser();

console.log('Bundling the scene package …');
const serveUrl = await bundle({
  entryPoint: join(packageRoot, 'src/index.ts'),
  webpackOverride,
});

for (const id of ids) {
  const composition = await selectComposition({ serveUrl, id, chromiumOptions });
  const outputLocation = join(outputDir, `${id}_${gl}.mp4`);
  const videoSeconds = composition.durationInFrames / composition.fps;

  console.log(
    `\nRendering ${id} (${composition.width}×${composition.height}, ${videoSeconds} s, gl=${gl})`,
  );
  let lastReported = -1;
  const startedAt = performance.now();

  await renderMedia({
    serveUrl,
    composition,
    codec: 'h264',
    outputLocation,
    chromiumOptions,
    concurrency: 1,
    // Generous because a cold tile cache can make the first frames slow.
    timeoutInMilliseconds: 60_000,
    onProgress: ({ progress }) => {
      const percent = Math.floor(progress * 10) * 10;
      if (percent > lastReported) {
        lastReported = percent;
        console.log(`  ${percent} %`);
      }
    },
  });

  const renderSeconds = (performance.now() - startedAt) / 1000;
  console.log(
    `${id}: ${renderSeconds.toFixed(1)} s for ${videoSeconds} s of video ` +
      `= ${(renderSeconds / videoSeconds).toFixed(2)} s per video second`,
  );
  console.log(`  → ${outputLocation}`);
}
