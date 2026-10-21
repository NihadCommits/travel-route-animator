import { z } from 'zod';
import type { LngLat } from '../geo/lngLat';
import { reportIssue } from './issues';

/** Stable ID (nanoid). Never changes, not even when the item is renamed. */
export const IdSchema = z.string().min(1, 'ID must not be empty');
export type Id = z.infer<typeof IdSchema>;

export const HexColorSchema = z
  .string()
  .regex(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i, 'Expected a hex color such as #E4572E');

export const IsoDateTimeSchema = z.iso.datetime({ offset: true });

/**
 * WGS84 coordinate in GeoJSON order [longitude, latitude].
 *
 * A latitude outside ±90 next to a longitude inside ±90 is the classic sign of a swapped
 * [lat, lng] pair, so the error message says so instead of only reporting the range.
 */
export const LngLatSchema: z.ZodType<LngLat> = z
  .tuple([z.number(), z.number()])
  .superRefine(([lng, lat], ctx) => {
    const looksSwapped = Math.abs(lat) > 90 && Math.abs(lng) <= 90;
    if (lng < -180 || lng > 180) {
      reportIssue(ctx, {
        path: [0],
        input: lng,
        code: 'lngLat.longitudeRange',
        message: `Longitude ${lng} is out of range (-180 to 180)`,
        values: { lng },
      });
    }
    if (lat < -90 || lat > 90) {
      reportIssue(ctx, {
        path: [1],
        input: lat,
        code: looksSwapped ? 'lngLat.swapped' : 'lngLat.latitudeRange',
        message:
          `Latitude ${lat} is out of range (-90 to 90)` +
          (looksSwapped ? '. Looks like [lat, lng]; coordinates must be [lng, lat]' : ''),
        values: { lat },
      });
    }
  });
