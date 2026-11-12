import { z } from 'zod';

// Files that belong to a project and live in its folder, next to project.json (ADR 0009).
// For now these are the images a vehicle can be drawn as; GPX files and photos come later.

/**
 * The ID also names the file on disk (assets/<id>.png), so it may hold nothing that could
 * reach outside the project's folder.
 */
export const AssetIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, 'Asset IDs may only use letters, digits, _ and -');

export const ImageMimeTypeSchema = z.enum(['image/png', 'image/gif']);
export type ImageMimeType = z.infer<typeof ImageMimeTypeSchema>;

export const ImageAssetSchema = z.strictObject({
  id: AssetIdSchema,
  kind: z.literal('image'),
  /** The file name it was added with, to recognise it in the editor. */
  name: z.string(),
  mimeType: ImageMimeTypeSchema,
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive(),
  /** 1 for a PNG; the pictures of an animated GIF. */
  frameCount: z.number().int().positive(),
});
export type ImageAsset = z.infer<typeof ImageAssetSchema>;

// One kind so far; a discriminated union once GPX files and photos arrive.
export const AssetSchema = ImageAssetSchema;
export type Asset = z.infer<typeof AssetSchema>;

const EXTENSIONS: Record<ImageMimeType, string> = { 'image/png': 'png', 'image/gif': 'gif' };

/** The asset's file in the project's assets folder: its ID and the extension of its type. */
export function assetFileName(asset: Pick<Asset, 'id' | 'mimeType'>): string {
  return `${asset.id}.${EXTENSIONS[asset.mimeType]}`;
}

/** What an image may be at most; the server refuses anything larger (ADR 0009). */
export const IMAGE_LIMITS = {
  bytes: 2 * 1024 * 1024,
  sidePx: 512,
  frames: 120,
} as const;
