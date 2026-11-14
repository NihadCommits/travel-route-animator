import {
  CameraModeSchema,
  checkEtappeReadiness,
  compileProfile,
  CornerSchema,
  editEtappe,
  measureLine,
  parseDurationText,
  presentAsOptions,
  profileTrackOf,
  renameItem,
  setCameraMode,
  setViewMode,
  showsElevation,
  ViewModeSchema,
  type CameraSettings,
  type Etappe,
  type ItemLocation,
  type OverlaySettings,
  type ReadinessIssue,
  type ViewSettings,
} from '@travel-route-animator/core';
import { videoCredits } from '@travel-route-animator/styles';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { de } from '@/i18n/de';
import { translateIssue } from '@/i18n/issues';
import { selectProject, useEditor } from '@/state/editorStore';
import { NumberField } from './fields/NumberField';
import { SelectField } from './fields/SelectField';
import { SliderField } from './fields/SliderField';
import { SwitchField } from './fields/SwitchField';
import { TextField } from './fields/TextField';
import { PinsSection } from '@/features/pins/PinsSection';
import { EndsSection } from './EndsSection';
import { MapStyleSection } from './MapStyleSection';
import { useOwnThemes, useSatelliteAvailable } from './mapStyles';
import { FormHeading, LaterNote, optionsOf, ReadinessNote, Row, Section, trackName } from './parts';
import { useEdit } from './useEdit';

const TRACK_PATH = /^tracks\[(\d+)\]/;

export function EtappeForm({ etappe, location }: { etappe: Etappe; location: ItemLocation }) {
  const edit = useEdit(location);
  const project = useEditor(selectProject);
  const ownThemes = useOwnThemes();
  const satelliteAvailable = useSatelliteAvailable();
  const [creditsCopied, setCreditsCopied] = useState(false);
  const group = project.groups.find((g) => g.etappen.some((e) => e.id === etappe.id));
  const { view, overlays } = etappe;

  // Everything the video credits, as one line for the video's description: the same line the
  // server writes next to a rendered video (<name>.credits.txt).
  const copyCredits = () => {
    const credits = videoCredits(project, [etappe.id], { themes: ownThemes, satelliteAvailable });
    void navigator.clipboard.writeText(credits.join(' · ')).then(() => setCreditsCopied(true));
  };
  const { camera } = view;
  const issues = useMemo(() => checkEtappeReadiness(etappe), [etappe]);
  const elevationJobs = useEditor((state) => state.elevationJobs);
  // Without a router's estimate the time counter only counts a typed duration.
  const timeCounterHint = (() => {
    const typed = overlays.manualDurationText;
    if (typed !== undefined) {
      return parseDurationText(typed) === undefined
        ? de.inspector.etappe.timeCounterUnreadable
        : undefined;
    }
    const counted =
      etappe.tracks.find((track) => track.id === camera.followTrackId) ?? etappe.tracks[0];
    return counted?.computed?.durationS === undefined
      ? de.inspector.etappe.timeCounterNoSource
      : undefined;
  })();
  const elevationNote = useMemo(() => {
    if (!showsElevation(etappe)) return undefined;
    const texts = de.inspector.etappe.elevation;
    const track = profileTrackOf(etappe);
    if (!track) return texts.noTrack;
    const elevation = track.computed?.elevation;
    if (elevation) {
      const profile = compileProfile(elevation, measureLine(track.computed!.geometry).lengthM);
      const format = (m: number) => Math.round(m).toLocaleString('de-AT');
      return texts.summary(
        trackName(track),
        format(profile.gainM.at(-1)!),
        format(profile.lossM.at(-1)!),
      );
    }
    if (!track.computed) return texts.noRoute;
    return elevationJobs[track.id]?.state === 'failed' ? texts.failed : texts.loading;
  }, [etappe, elevationJobs]);

  // Several vehicles without waypoints would read as the same line twice; name each one.
  const describe = (issue: ReadinessIssue) => {
    const match = TRACK_PATH.exec(issue.path);
    const track = match ? etappe.tracks[Number(match[1])] : undefined;
    return track ? `${trackName(track)}: ${translateIssue(issue)}` : translateIssue(issue);
  };

  const change = (field: string, update: (e: Etappe) => Etappe, coalesce = false) =>
    edit(field, (p) => editEtappe(p, etappe.id, update), { coalesce });
  const setView = <K extends keyof ViewSettings>(key: K, value: ViewSettings[K]) =>
    change(`view.${key}`, (e) => ({ ...e, view: { ...e.view, [key]: value } }), true);
  const setCamera = <K extends keyof CameraSettings>(key: K, value: CameraSettings[K]) =>
    change(`view.camera.${key}`, (e) => ({
      ...e,
      view: { ...e.view, camera: { ...e.view.camera, [key]: value } },
    }));
  const setOverlay = <K extends keyof OverlaySettings>(key: K, value: OverlaySettings[K]) =>
    change(`overlays.${key}`, (e) => ({ ...e, overlays: { ...e.overlays, [key]: value } }));

  return (
    <>
      <FormHeading kind={de.inspector.kinds.etappe} name={etappe.name} />
      <ReadinessNote issues={issues} describe={describe} />
      <TextField
        label={de.inspector.name}
        value={etappe.name}
        onCommit={(name) => edit('name', (p) => renameItem(p, etappe.id, name), { coalesce: true })}
      />
      <NumberField
        label={de.inspector.etappe.duration}
        value={etappe.durationSec}
        unit={de.fields.seconds}
        step={0.5}
        onCommit={(durationSec) => change('durationSec', (e) => ({ ...e, durationSec }), true)}
      />

      <Section title={de.inspector.etappe.view}>
        <SelectField
          label={de.inspector.etappe.viewMode}
          value={view.mode}
          options={optionsOf(ViewModeSchema.options, de.inspector.viewModes)}
          onCommit={(mode) => edit('view.mode', (p) => setViewMode(p, etappe.id, mode))}
        />
        <Row>
          <NumberField
            label={de.inspector.etappe.pitch}
            value={view.pitchDeg}
            unit={de.fields.degrees}
            step={5}
            disabled={view.mode === '2d'}
            hint={view.mode === '2d' ? de.inspector.etappe.pitchFlat : undefined}
            onCommit={(pitchDeg) => setView('pitchDeg', pitchDeg)}
          />
          <NumberField
            label={de.inspector.etappe.bearing}
            value={view.bearingDeg}
            unit={de.fields.degrees}
            step={5}
            onCommit={(bearingDeg) => setView('bearingDeg', bearingDeg)}
          />
        </Row>
        <SwitchField
          label={de.inspector.etappe.terrain}
          checked={view.terrain.enabled}
          onCommit={(enabled) => setView('terrain', { ...view.terrain, enabled })}
        />
        {view.terrain.enabled && view.mode === '2d' && (
          <p className="text-muted-foreground text-xs">{de.inspector.etappe.terrainFlat}</p>
        )}
        <SliderField
          label={de.inspector.etappe.exaggeration}
          value={view.terrain.exaggeration}
          min={1}
          max={3}
          step={0.1}
          format={de.inspector.etappe.exaggerationValue}
          disabled={!view.terrain.enabled}
          onCommit={(exaggeration) => setView('terrain', { ...view.terrain, exaggeration })}
        />
      </Section>

      <Section title={de.inspector.etappe.camera}>
        <SelectField
          label={de.inspector.etappe.cameraMode}
          value={camera.mode}
          // A fixed camera needs a position on the map; it becomes choosable once there is one.
          options={optionsOf(
            CameraModeSchema.options,
            de.inspector.cameraModes,
            (mode) => mode === 'static',
          )}
          hint={camera.mode === 'static' ? de.inspector.laterModule : undefined}
          onCommit={(mode) => edit('view.camera.mode', (p) => setCameraMode(p, etappe.id, mode))}
        />
        {camera.mode === 'follow' &&
          (etappe.tracks.length === 0 ? (
            <p className="text-muted-foreground text-xs">{de.inspector.etappe.noTrackToFollow}</p>
          ) : (
            <SelectField
              label={de.inspector.etappe.followTrack}
              value={camera.followTrackId ?? ''}
              options={[
                { value: '', label: de.inspector.etappe.chooseTrack, disabled: true },
                ...etappe.tracks.map((track) => ({ value: track.id, label: trackName(track) })),
              ]}
              onCommit={(trackId) => setCamera('followTrackId', trackId)}
            />
          ))}
        <SwitchField
          label={de.inspector.etappe.startWithOverview}
          checked={camera.startWithOverview}
          onCommit={(on) => setCamera('startWithOverview', on)}
        />
        <SwitchField
          label={de.inspector.etappe.endWithOverview}
          checked={camera.endWithOverview}
          onCommit={(on) => setCamera('endWithOverview', on)}
        />
      </Section>

      <EndsSection etappe={etappe} edit={edit} />

      <Section title={de.inspector.etappe.overlays}>
        <TextField
          label={de.inspector.etappe.title}
          value={overlays.title ?? ''}
          placeholder={de.inspector.etappe.titlePlaceholder}
          onCommit={(title) =>
            change(
              'overlays.title',
              ({ overlays: { title: _old, ...rest }, ...e }) => ({
                ...e,
                overlays: title === '' ? rest : { ...rest, title },
              }),
              true,
            )
          }
        />
        <SwitchField
          label={de.inspector.etappe.labels}
          checked={overlays.labels}
          onCommit={(on) => setOverlay('labels', on)}
        />
        <SwitchField
          label={de.inspector.etappe.distanceCounter}
          checked={overlays.distanceCounter}
          onCommit={(on) => setOverlay('distanceCounter', on)}
        />
        <SwitchField
          label={de.inspector.etappe.timeCounter}
          checked={overlays.timeCounter}
          onCommit={(on) => setOverlay('timeCounter', on)}
        />
        {overlays.timeCounter && (
          <TextField
            label={de.inspector.etappe.manualDuration}
            value={overlays.manualDurationText ?? ''}
            placeholder={de.inspector.etappe.manualDurationPlaceholder}
            hint={timeCounterHint}
            onCommit={(text) =>
              change(
                'overlays.manualDurationText',
                ({ overlays: { manualDurationText: _old, ...rest }, ...e }) => ({
                  ...e,
                  overlays: text.trim() === '' ? rest : { ...rest, manualDurationText: text },
                }),
                true,
              )
            }
          />
        )}
        <SwitchField
          label={de.inspector.etappe.elevationProfile}
          checked={overlays.elevationProfile}
          onCommit={(on) => setOverlay('elevationProfile', on)}
        />
        <SwitchField
          label={de.inspector.etappe.elevationCounter}
          checked={overlays.elevationCounter}
          onCommit={(on) => setOverlay('elevationCounter', on)}
        />
        {elevationNote && <p className="text-muted-foreground text-xs">{elevationNote}</p>}
        <SwitchField
          label={de.inspector.etappe.attribution}
          checked={overlays.attribution}
          onCommit={(on) => setOverlay('attribution', on)}
        />
        <SelectField
          label={de.inspector.etappe.attributionCorner}
          value={overlays.attributionCorner}
          options={optionsOf(CornerSchema.options, de.inspector.etappe.corners)}
          disabled={!overlays.attribution}
          onCommit={(corner) => setOverlay('attributionCorner', corner)}
        />
        <Button variant="outline" size="sm" className="w-full" onClick={copyCredits}>
          {creditsCopied ? de.inspector.etappe.creditsCopied : de.inspector.etappe.copyCredits}
        </Button>
        <p className="text-muted-foreground text-xs">{de.inspector.etappe.creditsHint}</p>
      </Section>

      <PinsSection etappe={etappe} edit={edit} />

      {group && (
        <MapStyleSection project={project} level={{ kind: 'etappe', etappe, group }} edit={edit} />
      )}

      {etappe.tracks.length >= 2 && (
        <Section title={de.inspector.etappe.options}>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => edit('tracks', (p) => presentAsOptions(p, etappe.id))}
          >
            {de.inspector.etappe.presentAsOptions}
          </Button>
          <p className="text-muted-foreground text-xs">
            {de.inspector.etappe.presentAsOptionsHint}
          </p>
        </Section>
      )}

      <LaterNote text={de.inspector.etappe.later} />
    </>
  );
}
