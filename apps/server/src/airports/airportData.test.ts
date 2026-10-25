import { PlaceSchema } from '@travel-route-animator/core';
import { describe, expect, it } from 'vitest';
import { airportsFromCsv, createAirportIndex, fold, placeFromAirport } from './airportData';
import { AIRPORTS_CSV } from './testAirports';

const airports = airportsFromCsv(AIRPORTS_CSV);
const index = createAirportIndex(airports);
const codes = (query: string) => index.search(query).map((airport) => airport.iata);

describe('airportsFromCsv', () => {
  it('keeps large and medium airports with an IATA code, read by column name', () => {
    expect(airports.map((airport) => airport.iata)).toEqual(['VIE', 'OPO', 'LIS', 'VDM']);
    expect(airports[0]).toEqual({
      iata: 'VIE',
      icao: 'LOWW',
      name: 'Vienna International Airport',
      municipality: 'Vienna',
      countryCode: 'AT',
      lngLat: [16.5697, 48.110298],
      size: 'large',
    });
    expect(airports[2]?.keywords).toEqual(['Lisboa', 'Portela']);
  });
});

describe('createAirportIndex', () => {
  it('puts the airport with the exact IATA or ICAO code first', () => {
    // Viedma follows because its name starts with "Vie", not because of its local code VIE.
    expect(codes('VIE')).toEqual(['VIE', 'VDM']);
    expect(codes('vie')[0]).toBe('VIE');
    expect(codes('LPPR')).toEqual(['OPO']);
  });

  it('finds airports by name, town and keywords, ignoring accents and words like "Flughafen"', () => {
    expect(codes('Flughafen Porto')).toEqual(['OPO']);
    expect(codes('sa carneiro')).toEqual(['OPO']);
    expect(codes('Lisboa')).toEqual(['LIS']);
    expect(codes('Vien')).toEqual(['VIE']);
  });

  it('ranks whole words above words that only start with the query', () => {
    const base = airports[0]!;
    const wordIndex = createAirportIndex([
      {
        ...base,
        iata: 'POZ',
        name: 'Poznań Airport',
        municipality: 'Poznań',
        keywords: ['Henryk Wieniawski'],
      },
      {
        ...base,
        iata: 'OTZ',
        name: 'Ralph Wien Memorial Airport',
        municipality: 'Kotzebue',
        size: 'medium',
      },
    ]);
    expect(wordIndex.search('Wien').map((airport) => airport.iata)).toEqual(['OTZ', 'POZ']);
  });

  it('returns nothing for a query that names no airport', () => {
    expect(codes('Flughafen')).toEqual([]);
    expect(codes('xy')).toEqual([]);
  });

  it('knows which airport lies next to a point', () => {
    // Photon places "Flughafen Wien-Schwechat" about 1.5 km from the OurAirports point.
    expect(index.codeNear([16.5849, 48.105])).toBe('VIE');
    expect(index.codeNear([16.3725, 48.2084])).toBeUndefined();
  });
});

describe('placeFromAirport', () => {
  it('becomes a place the editor can show and add', () => {
    const place = placeFromAirport(airports[1]!);
    expect(place).toMatchObject({
      id: 'airport:OPO',
      kind: 'airport',
      airportCode: 'OPO',
      city: 'Porto',
    });
    expect(PlaceSchema.safeParse(place).success).toBe(true);
  });
});

describe('fold', () => {
  it('drops accents and case', () => {
    expect(fold('Sá Carneiro Ñ')).toBe('sa carneiro n');
  });
});
