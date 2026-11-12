import { assetsOfEtappe, type Asset, type Project } from '@travel-route-animator/core';
import { ICON_SIZE_PX } from './icons';

// Own images as vehicles (ADR 0009). Each image is decoded once, when the stage loads, into
// its pictures at a fixed size; which picture shows in a frame is worked out from the frame
// (animationFrameAt), so nothing here depends on time.

/**
 * Pictures are drawn this many pixels long on their longer side: four times their 64 px on
 * the map, so they stay sharp in a 4K export and at twice the vehicle size.
 */
export const IMAGE_RASTER_PX = 256;
export const IMAGE_PIXEL_RATIO = IMAGE_RASTER_PX / ICON_SIZE_PX;

export interface DecodedImage {
  /** Every picture, IMAGE_RASTER_PX on its longer side; just one for a PNG. */
  frames: ImageData[];
  /** How long each picture shows, as the file says; 0 for a still image. */
  durationsMs: number[];
}

/** An image the stage needs: the asset and where its file loads from. */
export interface StageImage {
  asset: Asset;
  url: string;
}

/** The images a stage draws its vehicles with, where their URLs are known. */
export function stageImages(
  project: Project,
  etappeId: string,
  urls: Readonly<Record<string, string>> = {},
): StageImage[] {
  return assetsOfEtappe(project, etappeId).flatMap((asset) => {
    const url = urls[asset.id];
    return url ? [{ asset, url }] : [];
  });
}

/** The MapLibre image name of one picture of an image. */
export const imageFrameId = (assetId: string, frame: number) => `asset:${assetId}:${frame}`;
/** The MapLibre image name of an image's shadow on the ground (flights). */
export const imageShadowId = (assetId: string) => `asset-shadow:${assetId}`;

function rasterize(picture: VideoFrame): ImageData {
  const scale = IMAGE_RASTER_PX / Math.max(picture.displayWidth, picture.displayHeight);
  const width = Math.max(1, Math.round(picture.displayWidth * scale));
  const height = Math.max(1, Math.round(picture.displayHeight * scale));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d')!;
  context.imageSmoothingQuality = 'high';
  context.drawImage(picture, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

/**
 * Splits an image into its pictures with the browser's ImageDecoder (WebCodecs). It hands out
 * every picture of a GIF fully composed, so disposal and transparency need no code here. It
 * also decodes a PNG, as a single picture.
 */
export async function decodeImage({ asset, url }: StageImage): Promise<DecodedImage> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Cannot load the image "${asset.name}" (${response.status})`);
  }
  const decoder = new ImageDecoder({ data: await response.arrayBuffer(), type: asset.mimeType });
  try {
    await decoder.tracks.ready;
    await decoder.completed;
    const count = Math.max(1, decoder.tracks.selectedTrack?.frameCount ?? 1);
    const frames: ImageData[] = [];
    const durationsMs: number[] = [];
    for (let frameIndex = 0; frameIndex < count; frameIndex++) {
      const { image } = await decoder.decode({ frameIndex });
      try {
        frames.push(rasterize(image));
        // VideoFrame durations are in microseconds.
        durationsMs.push((image.duration ?? 0) / 1000);
      } finally {
        image.close();
      }
    }
    return { frames, durationsMs };
  } finally {
    decoder.close();
  }
}

/** The picture in one dark colour, keeping its outline: a plane's shadow on the ground. */
export function silhouette(picture: ImageData, color: string): ImageData {
  const n = parseInt(color.slice(1), 16);
  const data = new Uint8ClampedArray(picture.data.length);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = (n >> 16) & 255;
    data[i + 1] = (n >> 8) & 255;
    data[i + 2] = n & 255;
    data[i + 3] = picture.data[i + 3]!;
  }
  return new ImageData(data, picture.width, picture.height);
}
