import type { Unpacker } from '@travel-route-animator/core';

// Unpacking for track imports (M16): Garmin Connect's "Export Original" is a ZIP, Strava's
// archive has gzipped FIT files. The browser inflates both itself (DecompressionStream), so no
// library is needed; core reads the containers around the data.

async function through(data: Uint8Array, format: CompressionFormat): Promise<Uint8Array> {
  // A copy with its own ArrayBuffer: Blob does not take views on shared buffers.
  const stream = new Blob([new Uint8Array(data)])
    .stream()
    .pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export const browserUnpacker: Unpacker = {
  inflateRaw: (data) => through(data, 'deflate-raw'),
  gunzip: (data) => through(data, 'gzip'),
};
