import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assetFileName, type Asset } from '@travel-route-animator/core';

// Its own entry point (scene/render/assets): the server reads images for every render job,
// and must not load Remotion's renderer and bundler for that (the Windows app ships neither).

/**
 * The images a render needs, as data: URLs for the props (ADR 0009). The render page then
 * fetches nothing but map tiles: it needs no server for the images and no CORS, and a project
 * file anywhere works as long as its assets/ folder lies next to it.
 */
export async function readAssetUrls(
  assetsDir: string,
  assets: readonly Asset[],
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    assets.map(async (asset) => {
      const path = join(assetsDir, assetFileName(asset));
      let bytes: Buffer;
      try {
        bytes = await readFile(path);
      } catch (error) {
        throw new Error(`The image "${asset.name}" is missing: ${path}`, { cause: error });
      }
      return [asset.id, `data:${asset.mimeType};base64,${bytes.toString('base64')}`] as const;
    }),
  );
  return Object.fromEntries(entries);
}
