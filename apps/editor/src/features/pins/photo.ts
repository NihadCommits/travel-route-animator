import { IMAGE_LIMITS } from '@travel-route-animator/core';

/**
 * A phone photo made small enough for a pin (ADR 0014): at most IMAGE_LIMITS.sidePx on its
 * longer side, as JPEG. The browser turns it the way the camera held it (EXIF orientation)
 * while decoding, so the pixels come out upright; the GPS is read from the original before.
 */
export async function shrinkPhoto(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const scale = Math.min(1, IMAGE_LIMITS.sidePx / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d')!;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
  } finally {
    bitmap.close();
  }
}
