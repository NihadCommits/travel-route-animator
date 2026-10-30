import {
  checkRenderReadiness,
  cleanVideoName,
  locateItem,
  slugify,
  suggestVideoName,
  tracksAwaitingRoute,
  type Id,
  type OutputSettings,
  type Project,
} from '@travel-route-animator/core';
import { useQueryClient } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { useId, useMemo, useState, type FormEvent } from 'react';
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
  etappeId: Id;
  /** After the server took the job, e.g. to show the render list. */
  onStarted: () => void;
}

/** "Rendern" (UI-Konzept: Render-Dialog): one stage, its format and the file name. */
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
  // The suggestion follows the format until the name is edited by hand.
  const [openedAt] = useState(() => new Date());
  const [typedName, setTypedName] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const etappe = etappeOf(project, etappeId);
  const issues = useMemo(() => checkRenderReadiness(project, [etappeId]), [project, etappeId]);
  if (!etappe) return null;

  const name = typedName ?? suggestVideoName(etappe.name, { aspect, resolution }, openedAt);
  const fileName = cleanVideoName(name);
  // The editor computes road routes after every edit (routeSync); a render has to wait for
  // them, or the server would refuse the stage.
  const awaiting = tracksAwaitingRoute(etappe);
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
      const job = await api.startRender({
        projectId: project.id,
        etappeId,
        output: { aspect, resolution, fps },
        ...(fileName !== null && { fileName }),
      });
      storeRenderJob(queryClient, job);
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
          <DialogDescription>{de.render.etappe(etappe.name)}</DialogDescription>
        </DialogHeader>
        <p className="text-muted-foreground -mt-2 text-xs">{de.render.laterTargets}</p>

        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">{de.render.format}</legend>
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
          <p className="text-muted-foreground text-xs">
            {de.render.onlyThisRender} {de.render.codec}
          </p>
        </fieldset>

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
              : de.render.fileNameHint(slugify(project.name))}
          </p>
        </div>

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
