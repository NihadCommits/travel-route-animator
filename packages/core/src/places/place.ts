import { z } from 'zod';
import type { CreateWaypointInput } from '../model/factories';
import { LngLatSchema } from '../model/primitives';

// What the server's place and airport search returns. Not part of the project file: a chosen
// place becomes a waypoint (see waypointFromPlace), and only the waypoint is stored.

/** What kind of place it is, for the type shown in the suggestions ("Flughafen", "Bahnhof" …). */
export const PlaceKindSchema = z.enum([
  'airport',
  'station',
  'locality',
  'street',
  'address',
  'region',
  'poi',
]);
export type PlaceKind = z.infer<typeof PlaceKindSchema>;

export const PlaceSchema = z.strictObject({
  /** Stable within one result list, e.g. "photon:N123" or "airport:VIE"; for list keys. */
  id: z.string().min(1),
  name: z.string(),
  lngLat: LngLatSchema,
  kind: PlaceKindSchema,
  /** Where the result came from; becomes the waypoint's source. */
  source: z.enum(['search', 'airport']),
  airportCode: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  city: z.string().optional(),
  district: z.string().optional(),
  county: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  /** ISO 3166-1 alpha-2, upper case. */
  countryCode: z.string().optional(),
});
export type Place = z.infer<typeof PlaceSchema>;

export const PlaceListSchema = z.array(PlaceSchema);

export interface MergeOptions {
  /** What the user typed; an exact airport code ("VIE") always comes first. */
  query: string;
  /** For planes: airports before towns and addresses. */
  preferAirports: boolean;
  limit?: number;
}

/**
 * Combines the local airport search and the place search into one list. An airport the place
 * search already found (the server adds the IATA code to those) appears only once, keeping the
 * place search's entry because it carries the local name ("Flughafen Wien-Schwechat" rather
 * than "Vienna International Airport").
 */
export function mergePlaceResults(
  airports: readonly Place[],
  places: readonly Place[],
  { query, preferAirports, limit = 10 }: MergeOptions,
): Place[] {
  const codesFound = new Set(places.flatMap((place) => place.airportCode ?? []));
  const all = [
    ...places,
    ...airports.filter(
      ({ airportCode }) => airportCode === undefined || !codesFound.has(airportCode),
    ),
  ];

  const code = query.trim().toUpperCase();
  const rank = (place: Place) => {
    if (place.airportCode !== undefined && place.airportCode === code) return 0;
    const isAirport = place.kind === 'airport';
    return isAirport === preferAirports ? 1 : 2;
  };
  // Array.prototype.sort is stable, so each source keeps its own relevance order within a rank.
  return all.sort((a, b) => rank(a) - rank(b)).slice(0, limit);
}

/** The waypoint a chosen search result becomes. */
export function waypointFromPlace(place: Place): CreateWaypointInput {
  return {
    lngLat: [...place.lngLat],
    name: place.name,
    source: place.source,
    ...(place.airportCode !== undefined && { airportCode: place.airportCode }),
  };
}
