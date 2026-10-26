import {
  addWaypoint,
  mergePlaceResults,
  waypointFromPlace,
  type Etappe,
  type Place,
  type PlaceKind,
  type Track,
} from '@travel-route-animator/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  House,
  Landmark,
  Map as MapIcon,
  MapPin,
  Milestone,
  Plane,
  Search,
  TrainFront,
  type LucideIcon,
} from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { de } from '@/i18n/de';
import { api, ApiError, type SearchBias } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useEditor, type MapView } from '@/state/editorStore';
import { CONTROL_CLASS } from '../fields/FieldShell';
import type { Edit } from '../useEdit';

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;
// About a region around the point: near enough to prefer "Silves, Portugal", wide enough that
// the next town of the trip still counts as near.
const BIAS_ZOOM = 9;

const KIND_ICONS: Record<PlaceKind, LucideIcon> = {
  airport: Plane,
  station: TrainFront,
  locality: MapPin,
  street: Milestone,
  address: House,
  region: MapIcon,
  poi: Landmark,
};

const round = (value: number, digits: number) => Number(value.toFixed(digits));

/**
 * The search prefers what the map shows: with the map on Portugal, "Silves" finds the town in
 * the Algarve. Rounded, so that nudging the map a little does not start a new search. Without
 * a map (no WebGL) it prefers the trip so far: the track's last waypoint, else the stage's.
 */
function biasFor(track: Track, etappe: Etappe, mapView: MapView | null): SearchBias | undefined {
  if (mapView) {
    const [lng, lat] = mapView.center;
    return { lngLat: [round(lng, 2), round(lat, 2)], zoom: Math.round(mapView.zoom) };
  }
  const near = track.waypoints.at(-1) ?? etappe.tracks.flatMap((other) => other.waypoints).at(-1);
  return near ? { lngLat: near.lngLat, zoom: BIAS_ZOOM } : undefined;
}

/** "Schwechat, Niederösterreich, Österreich", without repeating the name itself. */
function detailOf(place: Place): string {
  const parts = [place.city, place.county ?? place.state, place.country];
  return parts.filter((part) => part !== undefined && part !== place.name).join(', ');
}

/**
 * Search field with suggestions (WAI-ARIA combobox). Airports come from the local list right
 * away, places from Photon through our server a moment later; both are merged so that a plane
 * gets airports first and an exact code like "VIE" is always on top.
 */
export function PlaceSearch({ track, etappe, edit }: { track: Track; etappe: Etappe; edit: Edit }) {
  const id = useId();
  const listId = `${id}-list`;
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const typed = text.trim();
  const query = useDebouncedValue(typed, DEBOUNCE_MS);
  const settled = query === typed;
  // Checks the typed text too, so the list closes at once after a choice clears the field.
  const expanded = open && typed.length >= MIN_QUERY_LENGTH && query.length >= MIN_QUERY_LENGTH;
  // Ask only for what is in the field and has stopped changing. Otherwise the old text would
  // be searched again right after a choice, because the new waypoint moves the bias.
  const enabled = expanded && settled;
  const mapView = useEditor((state) => state.mapView);
  const bias = biasFor(track, etappe, mapView);
  const biasKey = bias ? [...bias.lngLat, bias.zoom].join(',') : '';

  // TanStack Query cancels a request whose query is no longer needed, so typing on aborts the
  // previous search; the server then drops it before it reaches Photon.
  const airports = useQuery({
    queryKey: ['airports', query],
    queryFn: ({ signal }) => api.searchAirports(query, signal),
    enabled,
    staleTime: Infinity,
    retry: false,
    placeholderData: keepPreviousData,
  });
  const places = useQuery({
    queryKey: ['geocode', query, biasKey],
    queryFn: ({ signal }) => api.searchPlaces(query, bias, signal),
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
    placeholderData: keepPreviousData,
  });

  const preferAirports = track.vehicle.type === 'plane';
  const results = useMemo(
    () =>
      expanded
        ? mergePlaceResults(airports.data?.places ?? [], places.data?.places ?? [], {
            query,
            preferAirports,
          })
        : [],
    [expanded, airports.data, places.data, query, preferAirports],
  );
  const highlighted = Math.min(active, results.length - 1);

  const notes = [
    airports.error instanceof ApiError && airports.error.status === 503
      ? de.search.airportsMissing
      : undefined,
    places.error ? de.search.geocodingDown : undefined,
  ].filter((note) => note !== undefined);
  const searching = expanded && (!settled || airports.isFetching || places.isFetching);

  function choose(place: Place) {
    setError(edit('waypoints', (p) => addWaypoint(p, track.id, waypointFromPlace(place)).project));
    // Ready for the next point right away: Wien → Porto is two searches in a row.
    setText('');
    setActive(0);
  }

  const optionId = (index: number) => `${id}-option-${index}`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="sr-only">
        {de.search.label}
      </label>
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={expanded && highlighted >= 0 ? optionId(highlighted) : undefined}
          className={cn(CONTROL_CLASS, 'pl-7')}
          placeholder={de.search.placeholder}
          value={text}
          size={1}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setText(event.target.value);
            setActive(0);
            setOpen(true);
            setError(null);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setOpen(true);
              const step = event.key === 'ArrowDown' ? 1 : -1;
              setActive((current) =>
                results.length === 0 ? 0 : (current + step + results.length) % results.length,
              );
            } else if (event.key === 'Enter') {
              const place = results[highlighted];
              if (expanded && place) {
                event.preventDefault();
                choose(place);
              }
            } else if (event.key === 'Escape') {
              if (expanded) setOpen(false);
              else setText('');
            }
          }}
        />
      </div>

      {expanded && (
        <div className="bg-popover rounded-md border">
          <ul id={listId} role="listbox" aria-label={de.search.results} className="py-1">
            {results.map((place, index) => {
              const Icon = KIND_ICONS[place.kind];
              const detail = detailOf(place);
              return (
                <li
                  key={place.id}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === highlighted}
                  className={cn(
                    'flex cursor-pointer items-start gap-2 px-2 py-1.5',
                    index === highlighted && 'bg-accent',
                  )}
                  // Keeps the focus in the input, so the list does not close before the click.
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(place)}
                >
                  <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{place.name}</span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {de.search.kinds[place.kind]}
                      {detail && ` · ${detail}`}
                    </span>
                  </span>
                  {place.airportCode && (
                    <span className="text-muted-foreground shrink-0 font-mono text-xs">
                      {place.airportCode}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {results.length === 0 && (
            <p className="text-muted-foreground px-2 py-1.5 text-xs">
              {searching ? de.search.searching : de.search.nothingFound}
            </p>
          )}
        </div>
      )}

      {[...(expanded ? notes : []), ...(error ? [error] : [])].map((note) => (
        <p key={note} role="status" className="text-muted-foreground text-xs">
          {note}
        </p>
      ))}
    </div>
  );
}
