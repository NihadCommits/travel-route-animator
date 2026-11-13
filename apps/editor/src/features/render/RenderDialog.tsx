import {
  checkRenderReadiness,
  cleanVideoName,
  CODECS,
  codecHasAlpha,
  EXPORT_PRESETS,
  locateItem,
  outputExtensionOf,
  presetOf,
  slugify,
  suggestVideoName,
  tracksAwaitingRoute,
  type Codec,
  type ExportPresetId,
  type Id,
  type OutputSettings,
  type Project,
} from '@travel-route-animator/core';
import { useQueryClient } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SelectField } from '@/features/inspector/fields/SelectField';
import { SwitchField } from '@/features/inspector/fields/SwitchField';
import { optionsOf, ReadinessNote, trackName } from '@/features/inspector/parts';
import { ASPECTS, FRAME_RATES, RESOLUTIONS } from '@/features/inspector/ProjectForm';
import { de } from '@/i18n/de';
import { translateIssue } from '@/i18n/issues';
import { ApiError, api } from '@/lib/api';
import { selectProject, useEditor, useEditorStore } from '@/state/editorStore';
import { storeRenderJob } from './renderJobs';

interface RenderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The selected stage; null when a group itself is selected. */
  etappeId: Id | null;
  /** The group of the selection, for rendering all of its stages (ADR 0011). */
  groupId: Id;
  /** After the server took the job, e.g. to show the render list. */
  onStarted: () => void;
}

/** What gets rendered: the selected stage, the group as one video, or its stages one by one. */
type Scope = 'etappe' | 'chained' | 'separate';

/** "Rendern" (UI-Konzept: Render-Dialog): stage or group, the format and the file name. */
export function RenderDialog({ open, onOpenChange, ...props }: RenderDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Mounted only while open, so every opening starts from the project's defaults. */}
      {open && <RenderForm {...props} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function etappeOf(project: Project, etappeId: Id) {
  const location = locateItem(project, etappeId);
  if (location?.kind !== 'etappe') return undefined;
  return project.groups[location.groupIndex]!.etappen[location.etappeIndex];
}

function RenderForm({
  etappeId,
  groupId,
  onStarted,
  onDone,
}: Omit<RenderDialogProps, 'open' | 'onOpenChange'> & { onDone: () => void }) {
  const project = useEditor(selectProject);
  const routeJobs = useEditor((state) => state.routeJobs);
  const saveNow = useEditor((state) => state.saveNow);
  const store = useEditorStore();
  const queryClient = useQueryClient();
  const nameId = useId();

  const defaults = project.defaults.output;
  const [aspect, setAspect] = useState(defaults.aspect);
  const [resolution, setResolution] = useState(defaults.resolution);
  const [fps, setFps] = useState(defaults.fps);
  const [codec, setCodec] = useState(defaults.codec);
  const [overlay, setOverlay] = useState(defaults.transparentOverlay);
  // The suggestion follows the format until the name is edited by hand.
  const [openedAt] = useState(() => new Date());
  const [typedName, setTypedName] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const group = project.groups.find((candidate) => candidate.id === groupId);
  // A group of one stage is just that stage.
  const etappe =
    (etappeId !== null ? etappeOf(project, etappeId) : undefined) ??
    (group?.etappen.length === 1 ? group.etappen[0] : undefined);
  const [scope, setScope] = useState<Scope>(etappe ? 'etappe' : 'chained');
  const etappen = scope === 'etappe' ? (etappe ? [etappe] : []) : (group?.etappen ?? []);
  const etappeIds = etappen.map((e) => e.id);
  const issues = checkRenderReadiness(project, etappeIds);
  if (!group || etappen.length === 0) return null;

  const title = scope === 'etappe' ? etappen[0]!.name : group.name;
  const preset = presetOf({ aspect, resolution, fps, codec, transparentOverlay: overlay });
  const applyPreset = (id: ExportPresetId) => {
    const chosen = EXPORT_PRESETS[id];
    setAspect(chosen.aspect);
    setResolution(chosen.resolution);
    setFps(chosen.fps);
    setCodec(chosen.codec);
    setOverlay(chosen.transparentOverlay);
  };
  const changeCodec = (next: Codec) => {
    setCodec(next);
    // Only codecs with an alpha channel can be transparent.
    if (!codecHasAlpha(next)) setOverlay(false);
  };
  const name = typedName ?? suggestVideoName(title, { aspect, resolution }, openedAt);
  const fileName = scope === 'separate' ? '' : cleanVideoName(name);
  // The editor computes road routes after every edit (routeSync); a render has to wait for
  // them, or the server would refuse the stage.
  const awaiting = etappen.flatMap((e) => tracksAwaitingRoute(e));
  const computing = awaiting.filter((track) => routeJobs[track.id]?.state !== 'failed');
  const missing = awaiting.filter((track) => routeJobs[track.id]?.state === 'failed');
  const canStart = !busy && issues.length === 0 && awaiting.length === 0 && fileName !== null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canStart) return;
    setBusy(true);
    setError(undefined);
    // The server renders the project file, so it has to hold what the editor shows.
    await saveNow();
    if (store.getState().saveStatus.state === 'error') {
      setError(de.render.saveFailed);
      setBusy(false);
      return;
    }
    try {
      const output = { aspect, resolution, fps, codec, transparentOverlay: overlay };
      const named = fileName !== null && fileName !== '' ? { fileName } : {};
      // One by one: a job per stage, each named after its stage by the server.
      const requests =
        scope === 'separate'
          ? etappeIds.map((id) => ({ projectId: project.id, etappeId: id, output }))
          : scope === 'chained'
            ? [{ projectId: project.id, etappeIds, output, ...named }]
            : [{ projectId: project.id, etappeId: etappeIds[0]!, output, ...named }];
      for (const request of requests) storeRenderJob(queryClient, await api.startRender(request));
      onStarted();
      onDone();
    } catch (reason) {
      const serverIssues = reason instanceof ApiError ? (reason.body?.issues ?? []) : [];
      const message =
        serverIssues.length > 0
          ? serverIssues.map(translateIssue).join(' ')
          : reason instanceof Error
            ? reason.message
            : String(reason);
      setError(de.render.failed(message));
      setBusy(false);
    }
  }

  const keep =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      return null;
    };

  return (
    <DialogContent className="sm:max-w-lg">
      <form onSubmit={(event) => void handleSubmit(event)} className="grid gap-4" noValidate>
        <DialogHeader>
          <DialogTitle>{de.render.title}</DialogTitle>
          <DialogDescription>
            {scope === 'etappe'
              ? de.render.etappe(title)
              : de.render.group(group.name, group.etappen.length)}
          </DialogDescription>
        </DialogHeader>
        {group.etappen.length > 1 && (
          <SelectField
            label={de.render.target}
            value={scope}
            options={optionsOf(
              ['etappe', 'chained', 'separate'] as const,
              de.render.targets,
              (s) => (s === 'etappe' ? !etappe : false),
            )}
            hint={de.render.targetHints[scope]}
            onCommit={keep(setScope)}
          />
        )}

        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">{de.render.format}</legend>
          <SelectField
            label={de.render.preset}
            value={preset ?? 'custom'}
            options={[
              { value: 'custom', label: de.render.presets.custom, disabled: true },
              ...(Object.keys(EXPORT_PRESETS) as ExportPresetId[]).map((id) => ({
                value: id,
                label: de.render.presets[id],
              })),
            ]}
            onCommit={keep((id: string) => {
              if (id !== 'custom') applyPreset(id as ExportPresetId);
            })}
          />
          <div className="grid grid-cols-3 gap-2">
            <SelectField
              label={de.inspector.project.aspect}
              value={aspect}
              options={optionsOf(ASPECTS, de.inspector.aspects)}
              onCommit={keep(setAspect)}
            />
            <SelectField
              label={de.inspector.project.resolution}
              value={resolution}
              options={RESOLUTIONS.map((value) => ({ value, label: value }))}
              onCommit={keep(setResolution)}
            />
            <SelectField
              label={de.inspector.project.fps}
              value={String(fps) as (typeof FRAME_RATES)[number]}
              options={FRAME_RATES.map((value) => ({ value, label: `${value} fps` }))}
              onCommit={keep((value: string) => setFps(Number(value) as OutputSettings['fps']))}
            />
          </div>
          <SelectField
            label={de.render.codec}
            value={codec}
            options={optionsOf(CODECS, de.render.codecs)}
            hint={de.render.codecHints[codec]}
            onCommit={keep(changeCodec)}
          />
          <SwitchField
            label={de.render.overlay}
            checked={overlay}
            disabled={!codecHasAlpha(codec)}
            onCommit={keep(setOverlay)}
          />
          <p className="text-muted-foreground text-xs">
            {codecHasAlpha(codec) ? de.render.overlayHint : de.render.overlayNeedsAlpha}
          </p>
          <p className="text-muted-foreground text-xs">{de.render.onlyThisRender}</p>
        </fieldset>

        {scope === 'separate' ? (
          <p className="text-muted-foreground text-xs">
            {de.render.separateNames(etappen.length)}{' '}
            {de.render.fileNameHint(slugify(project.name), outputExtensionOf(codec))}
          </p>
        ) : (
          <div className="grid gap-1.5">
            <label htmlFor={nameId} className="text-muted-foreground text-xs">
              {de.render.fileName}
            </label>
            <Input
              id={nameId}
              value={name}
              spellCheck={false}
              aria-invalid={fileName === null}
              aria-describedby={`${nameId}-hint`}
              onChange={(event) => setTypedName(event.target.value)}
            />
            <p
              id={`${nameId}-hint`}
              className={
                fileName === null ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'
              }
            >
              {fileName === null
                ? de.render.fileNameInvalid
                : de.render.fileNameHint(slugify(project.name), outputExtensionOf(codec))}
            </p>
          </div>
        )}

        {issues.length > 0 && <ReadinessNote issues={issues} />}
        {computing.length > 0 && (
          <p role="status" className="text-muted-foreground flex items-center gap-2 text-sm">
            <LoaderCircle className="size-4 animate-spin" /> {de.render.routesComputing}
          </p>
        )}
        {missing.map((track) => (
          <p key={track.id} role="alert" className="text-warning text-sm">
            {de.render.routeMissing(trackName(track))}
          </p>
        ))}
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onDone}>
            {de.common.cancel}
          </Button>
          <Button type="submit" disabled={!canStart}>
            {busy ? de.render.starting : de.render.start}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
