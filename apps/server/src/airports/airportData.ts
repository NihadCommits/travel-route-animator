import { LngLatSchema, type LngLat, type Place } from '@travel-route-animator/core';
import { z } from 'zod';
import { parseCsvRecords } from './csv';

/** OurAirports, public domain, refreshed nightly (https://ourairports.com/data/). */
export const OURAIRPORTS_CSV_URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv';

export const AirportSchema = z.strictObject({
  iata: z.string().regex(/^[A-Z]{3}$/),
  icao: z.string().optional(),
  name: z.string(),
  municipality: z.string().optional(),
  countryCode: z.string(),
  lngLat: LngLatSchema,
  size: z.enum(['large', 'medium']),
  keywords: z.array(z.string()).optional(),
});
export type Airport = z.infer<typeof AirportSchema>;
export const AirportListSchema = z.array(AirportSchema);

const SIZES: Record<string, Airport['size']> = { large_airport: 'large', medium_airport: 'medium' };

/**
 * The airports worth offering for a flight: large and medium ones with an IATA code (about
 * 4,600 of the 85,000 entries). Columns are read by name; OurAirports' column order differs
 * from its documentation, and codes such as "VIE" also appear as local codes of other
 * airfields, so only `iata_code` counts.
 */
export function airportsFromCsv(csv: string): Airport[] {
  return parseCsvRecords(csv).flatMap((row) => {
    const size = SIZES[row.type ?? ''];
    const iata = row.iata_code?.trim() ?? '';
    const lng = Number(row.longitude_deg);
    const lat = Number(row.latitude_deg);
    if (!size || !/^[A-Z]{3}$/.test(iata) || !Number.isFinite(lng) || !Number.isFinite(lat)) {
      return [];
    }
    const keywords = (row.keywords ?? '')
      .split(',')
      .map((keyword) => keyword.trim())
      .filter(Boolean);
    return [
      {
        iata,
        ...(row.icao_code && { icao: row.icao_code }),
        name: row.name ?? iata,
        ...(row.municipality && { municipality: row.municipality }),
        countryCode: row.iso_country ?? '',
        lngLat: [lng, lat] satisfies LngLat,
        size,
        ...(keywords.length > 0 && { keywords }),
      },
    ];
  });
}

/** "Flughafen Wien", "Aeroporto do Porto": words that say "airport" but not which one. */
const GENERIC_WORDS = new Set([
  'flughafen',
  'airport',
  'aeroporto',
  'aeropuerto',
  'aeroport',
  'flugplatz',
  'international',
  'intl',
]);

/** Lower case without accents, so "Sá Carneiro" and "sa carneiro" match. */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

const words = (text: string) =>
  fold(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

export function placeFromAirport(airport: Airport): Place {
  return {
    id: `airport:${airport.iata}`,
    name: airport.name,
    lngLat: [...airport.lngLat],
    kind: 'airport',
    source: 'airport',
    airportCode: airport.iata,
    ...(airport.municipality && { city: airport.municipality }),
    countryCode: airport.countryCode,
  };
}

/** Flat-earth approximation in kilometres; plenty accurate for "within a few kilometres". */
function distanceKm([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const toRad = Math.PI / 180;
  const x = (lng2 - lng1) * toRad * Math.cos(((lat1 + lat2) / 2) * toRad);
  const y = (lat2 - lat1) * toRad;
  return Math.hypot(x, y) * 6371;
}

export interface AirportIndex {
  size: number;
  search(query: string, limit?: number): Airport[];
  /** IATA code of the airport closest to a point, if one lies within `maxKm`. */
  codeNear(lngLat: LngLat, maxKm?: number): string | undefined;
}

export function createAirportIndex(airports: readonly Airport[]): AirportIndex {
  const entries = airports.map((airport) => ({
    airport,
    words: new Set(
      [airport.name, airport.municipality ?? '', ...(airport.keywords ?? [])].flatMap(words),
    ),
  }));

  return {
    size: airports.length,

    search(query, limit = 8) {
      const code = query.trim().toUpperCase();
      const tokens = words(query).filter((token) => !GENERIC_WORDS.has(token));
      if (tokens.length === 0 && code.length < 3) return [];

      const scored = entries.flatMap(({ airport, words: haystack }) => {
        let score = 0;
        if (airport.iata === code) score = 100;
        else if (airport.icao === code) score = 90;
        else if (
          tokens.length > 0 &&
          tokens.every((token) => [...haystack].some((word) => word.startsWith(token)))
        ) {
          const inTown = tokens.some((token) => fold(airport.municipality ?? '').startsWith(token));
          // "Wien" as a whole word beats "Wien" as the start of "Wieniawski".
          const wholeWords = tokens.filter((token) => haystack.has(token)).length;
          score = 50 + wholeWords * 8 + (inTown ? 10 : 0);
        }
        if (score === 0) return [];
        return [{ airport, score: score + (airport.size === 'large' ? 5 : 0) }];
      });

      return scored
        .sort((a, b) => b.score - a.score || a.airport.name.localeCompare(b.airport.name))
        .slice(0, limit)
        .map(({ airport }) => airport);
    },

    codeNear(lngLat, maxKm = 5) {
      let best: { code: string; km: number } | undefined;
      for (const { airport } of entries) {
        const km = distanceKm(lngLat, airport.lngLat);
        if (km <= maxKm && (!best || km < best.km)) best = { code: airport.iata, km };
      }
      return best?.code;
    },
  };
}
