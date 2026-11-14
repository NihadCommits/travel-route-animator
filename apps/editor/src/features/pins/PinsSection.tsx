import {
  addPin,
  distanceToRoutes,
  editPin,
  pinWarnings,
  readPhotoPlace,
  removePin,
  type Etappe,
  type LngLat,
  type Pin,
  type Place,
} from '@travel-route-animator/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Camera, MapPin, Trash2 } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { NumberField } from '@/features/inspector/fields/NumberField';
import { SelectField } from '@/features/inspector/fields/SelectField';
import { TextField } from '@/features/inspector/fields/TextField';
import { CONTROL_CLASS } from '@/features/inspector/fields/FieldShell';
import { optionsOf, Section } from '@/features/inspector/parts';
import type { Edit } from '@/features/inspector/useEdit';
import { de } from '@/i18n/de';
import { api, ApiError } from '@/lib/api';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { selectProject, useEditor } from '@/state/editorStore';
import { shrinkPhoto } from './photo';

/** Search results further than this from the route are probably a place of the same name. */
const FAR_RESULT_M = 25_000;
const MIN_QUERY_LENGTH = 2;

const km = (metres: number) =>
  (metres / 1000).toLocaleString('de-AT', { maximumFractionDigits: metres < 10_000 ? 1 : 0 });

/** The middle of the stage's first route: where a photo without GPS goes for a start. */
function routeMiddle(etappe: Etappe): LngLat | undefined {
  const points = etappe.tracks.flatMap((track) =>
    track.computed ? track.computed.geometry : track.waypoints.map((w) => w.lngLat),
  );
  return points[Math.floor(points.length / 2)];
}

/**
 * "Fotos und Orte" (ADR 0014): photos with GPS and places that pop up along the way. Photos
 * are read in the browser (GPS), made small and uploaded; places come from the search, nearest
 * to the route first.
 */
export function PinsSection({ etappe, edit }: { etappe: Etappe; edit: Edit }) {
  const project = useEditor(selectProject);
  const fileRef = useRef<HTMLInputElement>(null);
  const searchId = useId();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string>();
  const [text, setText] = useState('');
  const query = useDebouncedValue(text.trim(), 300);
  const warnings = useMemo(() => pinWarnings(etappe), [etappe]);
  const middle = routeMiddle(etappe);

  const places = useQuery({
    queryKey: ['geocode', query, middle?.join(',') ?? ''],
    queryFn: ({ signal }) =>
      api.searchPlaces(query, middle ? { lngLat: middle, zoom: 9 } : undefined, signal),
    enabled: query.length >= MIN_QUERY_LENGTH,
    staleTime: 5 * 60 * 1000,
    retry: false,
    placeholderData: keepPreviousData,
  });
  // Nearest to the route first: "Puch" means the one on the way, not the one in Styria.
  const results = useMemo(
    () =>
      query.length < MIN_QUERY_LENGTH
        ? []
        : (places.data?.places ?? [])
            .map((place) => ({ place, distance: distanceToRoutes(etappe, place.lngLat) }))
            .sort((a, b) => a.distance - b.distance),
    [query, places.data, etappe],
  );

  const change = (field: string, update: Parameters<Edit>[1]) => edit(field, update);

  async function addPhoto(file: File) {
    setBusy(true);
    setNote(undefined);
    try {
      const place = readPhotoPlace(new Uint8Array(await file.arrayBuffer()));
      const small = await shrinkPhoto(file);
      const title = file.name.replace(/\.[^.]+$/, '');
      const asset = await api.uploadImage(project.id, small, `${title}.jpg`);
      const lngLat = place.lngLat ?? middle;
      if (!lngLat) {
        setNote(de.pins.needsRoute);
        return;
      }
      change('pins', (p) => addPin(p, etappe.id, { kind: 'photo', lngLat, title }, asset).project);
      if (!place.lngLat) setNote(de.pins.noGps(title));
    } catch (reason) {
      setNote(
        de.pins.photoFailed(reason instanceof ApiError ? `HTTP ${reason.status}` : String(reason)),
      );
    } finally {
      setBusy(false);
    }
  }

  function addPlace(place: Place) {
    change(
      'pins',
      (p) =>
        addPin(p, etappe.id, { kind: 'place', lngLat: place.lngLat, title: place.name }).project,
    );
    setText('');
  }

  const setPin = (pin: Pin, field: string, update: (pin: Pin) => Pin) =>
    edit(`pins.${pin.id}.${field}`, (p) => editPin(p, etappe.id, pin.id, update), {
      coalesce: true,
    });

  return (
    <Section title={de.pins.title}>
      <p className="text-muted-foreground text-xs">{de.pins.hint}</p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          <Camera /> {busy ? de.pins.uploading : de.pins.addPhoto}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png"
          aria-label={de.pins.photoFile}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void addPhoto(file);
          }}
        />
      </div>
      <div className="grid gap-1">
        <label htmlFor={searchId} className="text-muted-foreground text-xs">
          {de.pins.searchPlace}
        </label>
        <input
          id={searchId}
          className={CONTROL_CLASS}
          value={text}
          placeholder={de.pins.searchPlaceholder}
          onChange={(event) => setText(event.target.value)}
        />
        {results.length > 0 && (
          <ul aria-label={de.pins.results} className="grid gap-1">
            {results.slice(0, 6).map(({ place, distance }) => {
              const far = distance > FAR_RESULT_M;
              return (
                <li key={place.id}>
                  <button
                    type="button"
                    className="hover:bg-accent flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm"
                    onClick={() => addPlace(place)}
                  >
                    <MapPin className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{place.name}</span>
                    <span
                      className={far ? 'text-warning text-xs' : 'text-muted-foreground text-xs'}
                    >
                      {Number.isFinite(distance)
                        ? far
                          ? de.pins.far(km(distance))
                          : de.pins.near(km(distance))
                        : ''}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {note && (
        <p role="status" className="text-muted-foreground text-xs">
          {note}
        </p>
      )}

      {etappe.pins.map((pin) => {
        const warning = warnings.find((w) => w.pinId === pin.id);
        return (
          <fieldset key={pin.id} className="grid gap-2 rounded-md border p-2">
            <legend className="sr-only">{pin.title || de.pins.kinds[pin.kind]}</legend>
            <div className="flex items-end gap-2">
              <TextField
                className="flex-1"
                label={de.pins.kinds[pin.kind]}
                value={pin.title}
                onCommit={(title) => setPin(pin, 'title', (p) => ({ ...p, title }))}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={de.pins.remove(pin.title)}
                onClick={() => edit('pins', (p) => removePin(p, etappe.id, pin.id))}
              >
                <Trash2 />
              </Button>
            </div>
            <SelectField
              label={de.pins.trigger}
              value={pin.trigger.mode}
              options={optionsOf(['pass', 'time'] as const, de.pins.triggers)}
              onCommit={(mode) =>
                setPin(pin, 'trigger', (p) => ({
                  ...p,
                  trigger: mode === 'pass' ? { mode } : { mode, atSec: 0 },
                }))
              }
            />
            <div className="grid grid-cols-2 gap-2">
              {pin.trigger.mode === 'time' && (
                <NumberField
                  label={de.pins.atSec}
                  value={pin.trigger.atSec}
                  unit={de.fields.seconds}
                  step={0.5}
                  onCommit={(atSec) =>
                    setPin(pin, 'atSec', (p) => ({ ...p, trigger: { mode: 'time', atSec } }))
                  }
                />
              )}
              <NumberField
                label={de.pins.duration}
                value={pin.durationSec}
                unit={de.fields.seconds}
                step={0.5}
                onCommit={(durationSec) =>
                  setPin(pin, 'durationSec', (p) => ({ ...p, durationSec }))
                }
              />
            </div>
            {warning && (
              <p role="alert" className="text-warning text-xs">
                {de.pins.farWarning(km(warning.distanceKm * 1000))}
              </p>
            )}
          </fieldset>
        );
      })}
    </Section>
  );
}
