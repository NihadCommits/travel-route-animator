import type { LngLat, Place } from '@travel-route-animator/core';

export interface SearchBias {
  /** Results near this point come first. */
  lngLat: LngLat;
  /** Roughly the map zoom: how wide the "near" area is. */
  zoom: number;
}

export interface SearchQuery {
  text: string;
  lang: string;
  bias?: SearchBias | undefined;
  limit: number;
}

/**
 * A place search service. Photon is the first one; a self-hosted Photon or another service
 * can take its place without touching routes or the editor (ARCHITEKTUR: "Datenquellen").
 */
export interface GeocodingProvider {
  readonly name: string;
  search: (query: SearchQuery, signal?: AbortSignal) => Promise<Place[]>;
  /** The place at a point, e.g. to name a waypoint set by a click on the map. */
  reverse: (lngLat: LngLat, lang: string, signal?: AbortSignal) => Promise<Place | undefined>;
}

/** The service could not answer (offline, overloaded, throttled). Not the user's fault. */
export class GeocodingUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'GeocodingUnavailableError';
  }
}
