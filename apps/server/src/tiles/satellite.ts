import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { writeFileAtomic } from '../fs/writeFileAtomic';

// Satellite imagery through our own server (ADR 0010): the browser and the render page only
// ever see our URLs, the MapTiler key stays here. Tiles are kept on disk, so a stage drawn
// again (preview, then export) costs the quota once.

// MapTiler's satellite tileset. Checked with a real key (2026-11-15): satellite-v2 answers with
// 512 px JPEG tiles; satellite-v4, the example in MapTiler's API docs, answers 404 there.
const MAPTILER = 'https://api.maptiler.com/tiles/satellite-v2';

export class SatelliteUnavailableError extends Error {
  override name = 'SatelliteUnavailableError';
}

export interface TileJson {
  tiles: string[];
  [key: string]: unknown;
}

export interface SatelliteSource {
  /** The TileJSON with its tile URLs pointing at `ownUrl` instead of the provider. */
  tileJson(ownUrl: string): Promise<TileJson>;
  tile(z: number, x: number, y: number): Promise<{ bytes: Buffer; contentType: string }>;
}

export interface MapTilerOptions {
  apiKey: string;
  cacheDir: string;
  /** Like the other services; lets the key be limited to this tool in MapTiler's settings. */
  userAgent?: string;
  fetchImpl?: typeof fetch;
}

export function createMapTilerSatellite({
  apiKey,
  cacheDir,
  userAgent,
  fetchImpl = fetch,
}: MapTilerOptions): SatelliteSource {
  const init = userAgent ? { headers: { 'user-agent': userAgent } } : {};
  let upstream: Promise<TileJson> | undefined;

  function load(): Promise<TileJson> {
    upstream ??= (async () => {
      const response = await fetchImpl(
        `${MAPTILER}/tiles.json?key=${encodeURIComponent(apiKey)}`,
        init,
      );
      if (!response.ok) {
        // Never echo the URL: it holds the key.
        throw new SatelliteUnavailableError(`MapTiler answered ${response.status}`);
      }
      return (await response.json()) as TileJson;
    })();
    // A failure is not kept: the next request tries again.
    upstream.catch(() => (upstream = undefined));
    return upstream;
  }

  const extensionOf = (template: string) =>
    /\.(jpg|jpeg|png|webp)(\?|$)/.exec(template)?.[1] ?? 'jpg';
  const typeOf = (extension: string) => (extension === 'jpg' ? 'image/jpeg' : `image/${extension}`);

  return {
    async tileJson(ownUrl) {
      const { tiles: _tiles, ...rest } = await load();
      return { ...rest, tiles: [`${ownUrl}/api/tiles/satellite/{z}/{x}/{y}`] };
    },

    async tile(z, x, y) {
      const template = (await load()).tiles[0];
      if (!template) throw new SatelliteUnavailableError('MapTiler sent no tile URL');
      const extension = extensionOf(template);
      const file = join(cacheDir, String(z), String(x), `${y}.${extension}`);
      try {
        return { bytes: await readFile(file), contentType: typeOf(extension) };
      } catch {
        // Not cached yet.
      }
      const url = template
        .replace('{z}', String(z))
        .replace('{x}', String(x))
        .replace('{y}', String(y));
      const response = await fetchImpl(url, init);
      if (!response.ok) throw new SatelliteUnavailableError(`MapTiler answered ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      await mkdir(dirname(file), { recursive: true });
      await writeFileAtomic(file, bytes);
      return { bytes, contentType: response.headers.get('content-type') ?? typeOf(extension) };
    },
  };
}
