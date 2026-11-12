import {
  CameraModeSchema,
  checkEtappeReadiness,
  editEtappe,
  presentAsOptions,
  renameItem,
  resolveMapStyle,
  routingCredits,
  setCameraMode,
  setViewMode,
  ViewModeSchema,
  type CameraSettings,
  type Etappe,
  type ItemLocation,
  type OverlaySettings,
  type ReadinessIssue,
  type ViewSettings,
} from '@travel-route-animator/core';
import { resolveTheme, styleCredits } from '@travel-route-animator/styles';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { de } from '@/i18n/de';
import { translateIssue } from '@/i18n/issues';
import { selectProject, useEditor } from '@/state/editorStore';
import { NumberField } from './fields/NumberField';
import { SelectField } from './fields/SelectField';
import { SwitchField } from './fields/SwitchField';
import { TextField } from './fields/TextField';
import { MapStyleSection } from './MapStyleSection';
import { useOwnThemes } from './mapStyles';
import { FormHeading, LaterNote, optionsOf, ReadinessNote, Row, Section, trackName } from './parts';
import { useEdit } from './useEdit';

const TRACK_PATH = /^tracks\[(\d+)\]/;

export function EtappeForm({ etappe, location }: { etappe: Etappe; location: ItemLocation }) {
  const edit = useEdit(location);
  const project = useEditor(selectProject);
  const ownThemes = useOwnThemes();
  const [creditsCopied, setCreditsCopied] = useState(false);
  const group = project.groups.find((g) => g.etappen.some((e) => e.id === etappe.id));
  const { view, overlays } = etappe;

  // Everything the video credits, as one line for the video's description.
  const copyCredits = () => {
    const style = resolveMapStyle(project, etappe.id).value;
    const credits = [
      ...styleCredits(style, resolveTheme(style.themeId, ownThemes).theme),
      ...routingCredits(etappe.tracks.map((track) => track.computed?.provider)),
    ];
    void navigator.clipboard.writeText(credits.join(' · ')).then(() => setCreditsCopied(true));
  };
  const { camera } = view;
  const issues = useMemo(() => checkEtappeReadiness(etappe), [etappe]);

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
          label={de.inspector.etappe.attribution}
          checked={overlays.attribution}
          onCommit={(on) => setOverlay('attribution', on)}
        />
        <Button variant="outline" size="sm" className="w-full" onClick={copyCredits}>
          {creditsCopied ? de.inspector.etappe.creditsCopied : de.inspector.etappe.copyCredits}
        </Button>
        <p className="text-muted-foreground text-xs">{de.inspector.etappe.creditsHint}</p>
      </Section>

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
