import { describe, expect, it } from 'vitest';
import type { LngLat } from '../geo/lngLat';
import { mergePlaceResults, PlaceSchema, waypointFromPlace, type Place } from './place';

const vie: Place = {
  id: 'airport:VIE',
  name: 'Vienna International Airport',
  lngLat: [16.5697, 48.1103],
  kind: 'airport',
  source: 'airport',
  airportCode: 'VIE',
  city: 'Vienna',
  countryCode: 'AT',
};
const lis: Place = { ...vie, id: 'airport:LIS', name: 'Lisbon Airport', airportCode: 'LIS' };
const photonVie: Place = {
  id: 'photon:W1',
  name: 'Flughafen Wien-Schwechat',
  lngLat: [16.5849, 48.105],
  kind: 'airport',
  source: 'search',
  airportCode: 'VIE',
  city: 'Schwechat',
};
const wien: Place = {
  id: 'photon:R1',
  name: 'Wien',
  lngLat: [16.3725, 48.2084],
  kind: 'locality',
  source: 'search',
};
const ids = (places: Place[]) => places.map((place) => place.id);

describe('mergePlaceResults', () => {
  it('puts airports first for planes and towns first otherwise', () => {
    expect(ids(mergePlaceResults([lis], [wien], { query: 'li', preferAirports: true }))).toEqual([
      'airport:LIS',
      'photon:R1',
    ]);
    expect(ids(mergePlaceResults([lis], [wien], { query: 'li', preferAirports: false }))).toEqual([
      'photon:R1',
      'airport:LIS',
    ]);
  });

  it('always starts with an exact airport code', () => {
    const merged = mergePlaceResults([vie], [wien], { query: ' vie ', preferAirports: false });
    expect(ids(merged)).toEqual(['airport:VIE', 'photon:R1']);
  });

  it('shows an airport found by both searches once, with the local name', () => {
    const merged = mergePlaceResults([vie], [photonVie, wien], {
      query: 'Flughafen Wien',
      preferAirports: true,
    });
    expect(ids(merged)).toEqual(['photon:W1', 'photon:R1']);
  });

  it('shows a place mapped twice close together once, but keeps namesakes elsewhere', () => {
    const station: Place = {
      id: 'photon:N1',
      name: 'Wien Kaiserebersdorf',
      lngLat: [16.4654, 48.1462],
      kind: 'station',
      source: 'search',
    };
    const platform = { ...station, id: 'photon:N2', lngLat: [16.4657, 48.1459] as LngLat };
    const otherTown = { ...wien, id: 'photon:R9', lngLat: [-80.9, 35.2] as LngLat };
    const merged = mergePlaceResults([], [station, platform, wien, otherTown], {
      query: 'Wien',
      preferAirports: false,
    });
    expect(ids(merged)).toEqual(['photon:N1', 'photon:R1', 'photon:R9']);
  });

  it('keeps the list short', () => {
    const many = Array.from({ length: 15 }, (_, i) => ({
      ...wien,
      id: `photon:${i}`,
      lngLat: [i, 48] as LngLat,
    }));
    expect(mergePlaceResults([], many, { query: 'x', preferAirports: false })).toHaveLength(10);
  });
});

describe('waypointFromPlace', () => {
  it('keeps the coordinates in [lng, lat] order and the airport code', () => {
    expect(waypointFromPlace(vie)).toEqual({
      lngLat: [16.5697, 48.1103],
      name: 'Vienna International Airport',
      source: 'airport',
      airportCode: 'VIE',
    });
    expect(waypointFromPlace(wien)).not.toHaveProperty('airportCode');
  });
});

describe('PlaceSchema', () => {
  it('rejects swapped coordinates like every other coordinate in the project', () => {
    expect(PlaceSchema.safeParse({ ...wien, lngLat: [48.2084, 116.37] }).success).toBe(false);
  });
});
