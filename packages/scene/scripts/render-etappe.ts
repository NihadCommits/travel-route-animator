/**
 * Renders one stage of a project to MP4.
 *
 *   pnpm render:etappe --file examples/portugal-2026/project.json --etappe "Wohin morgen?"
 *   pnpm render:etappe --file data/projects/portugal-2026/project.json --etappe e_lissabon_algarve
 *       --aspect 9:16 --resolution 1080p --fps 30 --gl angle
 *
 * Road routes the project does not hold yet come from the local server, which has the
 * openrouteservice key and its cache; if it is not running, the script starts it for the
 * render. Nothing else leaves this machine but map tiles.
 * The server in M7 will render the same way; this script is the stand-in until then.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
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
import {
  checkRenderReadiness,
  ComputedRouteSchema,
  describeIssues,
  isLocalRoutingMode,
  isRouteStale,
  parseProjectFile,
  refreshLocalRoutes,
  resolveOutput,
  slugify,
  toRouteRequest,
  type OutputSettings,
  type Project,
} from '@travel-route-animator/core';
import type { EtappeProps } from '../src/compositions/EtappeComposition';
import { webpackOverride } from '../webpack-override';

const GL_RENDERERS: readonly OpenGlRenderer[] = [
  'angle',
  'angle-egl',
  'egl',
  'swangle',
  'swiftshader',
  'vulkan',
];

const repoRoot = resolve(import.meta.dirname, '../../..');
const DEFAULT_SERVER = 'http://127.0.0.1:5174';

const { values } = parseArgs({
  options: {
    file: { type: 'string' },
    etappe: { type: 'string' },
    server: { type: 'string', default: DEFAULT_SERVER },
    gl: { type: 'string', default: 'angle' },
    aspect: { type: 'string' },
    resolution: { type: 'string' },
    fps: { type: 'string' },
  },
});

function fail(message: string): never {
  console.error(`\n${message}`);
  process.exit(1);
}

if (!values.file || !values.etappe) {
  fail('Usage: pnpm render:etappe --file <project.json> --etappe "<name or id>"');
}
const gl = GL_RENDERERS.find((renderer) => renderer === values.gl);
if (!gl) fail(`Unknown --gl value "${values.gl}". Use one of: ${GL_RENDERERS.join(', ')}`);

/**
 * --aspect, --resolution and --fps on top of the project's output settings, checked the same
 * way the timeline resolves them (resolveOutput), so a bad value fails here and not mid-render.
 */
function outputOverrides(project: Project): Partial<OutputSettings> {
  const overrides = {
    ...(values.aspect && { aspect: values.aspect }),
    ...(values.resolution && { resolution: values.resolution }),
    ...(values.fps && { fps: Number(values.fps) }),
  } as Partial<OutputSettings>;
  try {
    resolveOutput(project, overrides);
  } catch (error) {
    fail(`Invalid output setting: ${error instanceof Error ? error.message : String(error)}`);
  }
  return overrides;
}

async function loadProject(file: string): Promise<Project> {
  const raw: unknown = JSON.parse(await readFile(resolve(repoRoot, file), 'utf8'));
  const parsed = parseProjectFile(raw);
  if (!parsed.success) fail(`${file} is not a valid project:\n${describeIssues(parsed.issues)}`);
  return parsed.data;
}

async function serverAnswers(): Promise<boolean> {
  try {
    const response = await fetch(`${values.server}/api/health`, {
      signal: AbortSignal.timeout(1500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Makes sure the local server is there to ask for road routes. If nothing answers at the
 * default address, the script starts the server itself and stops it again when it ends, so a
 * render needs no second terminal with pnpm dev. A plain node process with the tsx loader
 * (not a shell or the tsx CLI) so that killing it stops the server on Windows too.
 */
let startedServer: ChildProcess | undefined;

async function ensureServer(): Promise<void> {
  if (startedServer || (await serverAnswers())) return;
  if (values.server !== DEFAULT_SERVER) {
    fail(`The server at ${values.server} does not answer.`);
  }
  console.log('The local server is not running; starting it for the road routes …');
  const serverDir = join(repoRoot, 'apps/server');
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: serverDir,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  startedServer = child;
  let errors = '';
  child.stderr.on('data', (chunk: Buffer) => (errors += chunk.toString()));
  // Also on fail() and Ctrl+C, which end the process without reaching the normal stop.
  process.on('exit', () => child.kill());

  for (let waited = 0; waited < 30_000; waited += 300) {
    if (child.exitCode !== null) break;
    if (await serverAnswers()) return;
    await new Promise((done) => setTimeout(done, 300));
  }
  fail(`The local server did not start.${errors ? `\n${errors.trim()}` : ''}`);
}

/**
 * Stops a server this script started, as soon as the routes are in. Its open output pipe
 * would otherwise keep Node waiting after the render, and the script would never end.
 */
function stopStartedServer(): void {
  startedServer?.kill();
  startedServer = undefined;
}

/** Asks the local server for every road route of the stage that is missing or stale. */
async function withRoadRoutes(project: Project, etappeId: string): Promise<Project> {
  for (const group of project.groups) {
    for (const etappe of group.etappen) {
      if (etappe.id !== etappeId) continue;
      for (const track of etappe.tracks) {
        const { mode } = track.routing;
        if (isLocalRoutingMode(mode) || mode === 'gpx' || track.waypoints.length < 2) continue;
        if (!isRouteStale(track)) continue;
        await ensureServer();
        console.log(
          `Asking ${values.server} for the ${mode} route of "${track.label ?? track.id}" …`,
        );
        let response: Response;
        try {
          response = await fetch(`${values.server}/api/route`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(toRouteRequest(track, 'ors')),
          });
        } catch {
          fail(`The local server at ${values.server} stopped answering.`);
        }
        const body: unknown = await response.json();
        if (!response.ok)
          fail(`No route for "${track.label ?? track.id}": ${JSON.stringify(body)}`);
        track.computed = ComputedRouteSchema.parse(body);
      }
    }
  }
  return project;
}

const loaded = await loadProject(values.file);
const etappe = loaded.groups
  .flatMap((group) => group.etappen)
  .find((e) => e.id === values.etappe || e.name.toLowerCase() === values.etappe!.toLowerCase());
if (!etappe) fail(`No stage "${values.etappe}" in ${values.file}`);

const project = refreshLocalRoutes(await withRoadRoutes(loaded, etappe.id), loaded.updatedAt);
// The render needs no server; only the routes did.
stopStartedServer();
const issues = checkRenderReadiness(project, [etappe.id]);
if (issues.length > 0) fail(`"${etappe.name}" cannot be rendered yet:\n${describeIssues(issues)}`);

const output = outputOverrides(project);
const inputProps: EtappeProps = { project, etappeId: etappe.id, output };
// Maps are WebGL-heavy: Remotion recommends the GPU (angle) and one browser tab at a time.
const chromiumOptions: ChromiumOptions = { gl };
const outputDir = join(repoRoot, 'output', slugify(project.name));
const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
const outputLocation = join(outputDir, `${slugify(etappe.name)}_${stamp}.mp4`);

await mkdir(outputDir, { recursive: true });
// Downloads Chrome Headless Shell on the first run only.
await ensureBrowser();
console.log('Bundling the scene …');
const serveUrl = await bundle({
  entryPoint: join(import.meta.dirname, '../src/index.ts'),
  webpackOverride,
});
const composition = await selectComposition({
  serveUrl,
  id: 'Etappe',
  inputProps,
  chromiumOptions,
});
console.log(
  `Rendering "${etappe.name}": ${composition.width}×${composition.height}, ` +
    `${(composition.durationInFrames / composition.fps).toFixed(1)} s at ${composition.fps} fps, gl=${gl}`,
);

const startedAt = performance.now();
let lastReported = -1;
await renderMedia({
  serveUrl,
  composition,
  inputProps,
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
const seconds = (performance.now() - startedAt) / 1000;
console.log(`\nDone in ${seconds.toFixed(1)} s: ${outputLocation}`);
