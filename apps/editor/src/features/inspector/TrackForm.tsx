import {
  changeVehicleType,
  checkEtappeReadiness,
  EasingSchema,
  editTrack,
  flightStyleFor,
  RoadAvoidSchema,
  renameItem,
  VEHICLE_CATALOG,
  VEHICLE_TYPES,
  type Etappe,
  type FlightOptions,
  type ItemLocation,
  type RoadAvoid,
  type RoutingMode,
  type Track,
  type TrackStyle,
  type TrackTiming,
} from '@travel-route-animator/core';
import { useMemo } from 'react';
import { de } from '@/i18n/de';
import { ColorField } from './fields/ColorField';
import { NumberField } from './fields/NumberField';
import { SelectField } from './fields/SelectField';
import { SwitchField } from './fields/SwitchField';
import { TextField } from './fields/TextField';
import { FormHeading, LaterNote, optionsOf, ReadinessNote, Row, Section, trackName } from './parts';
import { RouteStatus } from './RouteStatus';
import { useEdit } from './useEdit';
import { WaypointList } from './waypoints/WaypointList';

const LINE_DASHES = ['solid', 'dashed', 'dotted'] as const;
const ROAD_AVOIDS = RoadAvoidSchema.options;
/** Beyond half the distance the arc leaves the picture at any sensible zoom. */
const MAX_ARC_PERCENT = 50;

export function TrackForm({
  track,
  etappe,
  location,
}: {
  track: Track;
  etappe: Etappe;
  location: Extract<ItemLocation, { kind: 'track' }>;
}) {
  const edit = useEdit(location);
  const { timing, style } = track;
  const issues = useMemo(
    () =>
      checkEtappeReadiness(etappe).filter((issue) =>
        issue.path.startsWith(`tracks[${location.trackIndex}]`),
      ),
    [etappe, location.trackIndex],
  );

  const change = (field: string, update: (t: Track) => Track, coalesce = false) =>
    edit(field, (p) => editTrack(p, track.id, update), { coalesce });
  const setTiming = <K extends keyof TrackTiming>(key: K, value: TrackTiming[K]) =>
    change(`timing.${key}`, (t) => ({ ...t, timing: { ...t.timing, [key]: value } }), true);
  const setStyle = <K extends keyof TrackStyle>(key: K, value: TrackStyle[K], coalesce = true) =>
    change(`style.${key}`, (t) => ({ ...t, style: { ...t.style, [key]: value } }), coalesce);
  // Only planes have flight options (the factories add them); others never show the section.
  const setFlight = <K extends keyof FlightOptions>(key: K, value: FlightOptions[K]) =>
    change(
      `flight.${key}`,
      (t) => (t.flight ? { ...t, flight: { ...t.flight, [key]: value } } : t),
      typeof value === 'number',
    );

  // Routing options to avoid belong to road routing only, so they go when the mode changes.
  const setRouting = (mode: RoutingMode) =>
    change('routing.mode', (t) => ({
      ...t,
      routing: mode === 'road' ? { ...t.routing, mode } : { mode },
    }));

  // An empty list is the same as none; leave the field out so the file stays tidy.
  const setAvoid = (avoid: RoadAvoid, on: boolean) =>
    change('routing.avoid', (t) => {
      const current = (t.routing.avoid ?? []).filter((a) => a !== avoid);
      const next = on ? [...current, avoid] : current;
      const { avoid: _old, ...routing } = t.routing;
      return { ...t, routing: next.length > 0 ? { ...routing, avoid: next } : routing };
    });

  // Without its own duration a track drives until the stage ends. Switching that off starts
  // with exactly that time, so nothing visibly changes until the duration is edited.
  const setUntilEnd = (untilEnd: boolean) =>
    change('timing.durationSec', ({ timing: { durationSec: _old, ...rest }, ...t }) => {
      const remaining = etappe.durationSec - rest.startOffsetSec;
      return {
        ...t,
        timing: untilEnd
          ? rest
          : { ...rest, durationSec: remaining > 0 ? remaining : etappe.durationSec },
      };
    });

  return (
    <>
      <FormHeading kind={de.inspector.kinds.track} name={trackName(track)} />
      <ReadinessNote issues={issues} />
      <TextField
        label={de.inspector.track.label}
        value={track.label ?? ''}
        placeholder={de.vehicles[track.vehicle.type]}
        onCommit={(label) =>
          edit('label', (p) => renameItem(p, track.id, label), { coalesce: true })
        }
      />
      <SelectField
        label={de.inspector.track.vehicle}
        value={track.vehicle.type}
        options={optionsOf(VEHICLE_TYPES, de.vehicles)}
        onCommit={(type) =>
          edit('vehicle.type', (p) => {
            const changed = changeVehicleType(p, track.id, type);
            // New tracks are labelled with their vehicle ("Auto"). Such a label would be wrong
            // after the switch, so it follows; a label of its own ("Freunde") stays.
            return track.label === de.vehicles[track.vehicle.type]
              ? renameItem(changed, track.id, de.vehicles[type])
              : changed;
          })
        }
      />
      <SelectField
        label={de.inspector.track.routing}
        value={track.routing.mode}
        // A GPX track needs an imported file (M14); until then it is only shown if already set.
        options={optionsOf(
          VEHICLE_CATALOG[track.vehicle.type].routingModes,
          de.inspector.routingModes,
          (mode) => mode === 'gpx' && track.routing.mode !== 'gpx',
        )}
        onCommit={setRouting}
      />
      {track.routing.mode === 'road' && (
        <fieldset className="space-y-1.5">
          <legend className="sr-only">{de.inspector.track.avoid}</legend>
          {ROAD_AVOIDS.map((avoid) => (
            <SwitchField
              key={avoid}
              label={de.inspector.track.avoids[avoid]}
              checked={track.routing.avoid?.includes(avoid) ?? false}
              onCommit={(on) => setAvoid(avoid, on)}
            />
          ))}
        </fieldset>
      )}
      <RouteStatus track={track} />

      <WaypointList track={track} etappe={etappe} edit={edit} />

      <Section title={de.inspector.track.timing}>
        <Row>
          <NumberField
            label={de.inspector.track.start}
            value={timing.startOffsetSec}
            unit={de.fields.seconds}
            step={0.5}
            onCommit={(start) => setTiming('startOffsetSec', start)}
          />
          {timing.durationSec !== undefined && (
            <NumberField
              label={de.inspector.track.duration}
              value={timing.durationSec}
              unit={de.fields.seconds}
              step={0.5}
              onCommit={(duration) => setTiming('durationSec', duration)}
            />
          )}
        </Row>
        <SwitchField
          label={de.inspector.track.untilEnd}
          checked={timing.durationSec === undefined}
          onCommit={setUntilEnd}
        />
        <SelectField
          label={de.inspector.track.easing}
          value={timing.easing}
          options={optionsOf(EasingSchema.options, de.inspector.easings)}
          onCommit={(easing) => setTiming('easing', easing)}
        />
      </Section>

      <Section title={de.inspector.track.style}>
        <ColorField
          label={de.inspector.track.lineColor}
          value={style.lineColor}
          onCommit={(color) => (color === undefined ? null : setStyle('lineColor', color))}
        />
        <Row>
          <NumberField
            label={de.inspector.track.lineWidth}
            value={style.lineWidthPx}
            unit={de.fields.pixels}
            onCommit={(width) => setStyle('lineWidthPx', width)}
          />
          <NumberField
            label={de.inspector.track.vehicleScale}
            value={style.vehicleScale}
            unit={de.fields.times}
            step={0.1}
            onCommit={(scale) => setStyle('vehicleScale', scale)}
          />
        </Row>
        <SelectField
          label={de.inspector.track.lineDash}
          value={style.lineDash}
          options={optionsOf(LINE_DASHES, de.inspector.lineDashes)}
          onCommit={(dash) => setStyle('lineDash', dash, false)}
        />
        <SwitchField
          label={de.inspector.track.ghostRoute}
          checked={style.futureRoute === 'ghost'}
          onCommit={(on) => setStyle('futureRoute', on ? 'ghost' : 'hidden', false)}
        />
      </Section>

      {track.flight && (
        <Section title={de.inspector.track.flight.title}>
          <NumberField
            label={de.inspector.track.flight.arcHeight}
            // Stored as a share; shown in per cent, which reads more naturally.
            value={track.flight.arcHeightFactor * 100}
            unit={de.fields.percent}
            step={1}
            hint={de.inspector.track.flight.arcHeightHint}
            onCommit={(percent) =>
              percent < 0 || percent > MAX_ARC_PERCENT
                ? de.inspector.track.flight.arcHeightRange
                : setFlight('arcHeightFactor', percent / 100)
            }
          />
          <SwitchField
            label={de.inspector.track.flight.shadow}
            checked={track.flight.showGroundShadow}
            onCommit={(on) => setFlight('showGroundShadow', on)}
          />
          <SwitchField
            label={de.inspector.track.flight.takeoffLandingCamera}
            checked={track.flight.takeoffLandingCamera}
            onCommit={(on) => setFlight('takeoffLandingCamera', on)}
          />
          <p className="text-muted-foreground text-xs">
            {flightStyleFor(etappe.view.pitchDeg) === 'arc-3d'
              ? de.inspector.track.flight.arc3d
              : de.inspector.track.flight.fake3d}
          </p>
        </Section>
      )}

      <LaterNote text={de.inspector.track.later} />
    </>
  );
}
