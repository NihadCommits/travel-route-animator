import { isRenderJobFinished, type RenderJob } from '@travel-route-animator/core';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, FolderOpen, Square, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { de } from '@/i18n/de';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDuration, formatVideo } from './format';
import { RENDERS_KEY, storeRenderJob } from './renderJobs';

/** The file name of a job's video, from its full path (Windows or POSIX). */
const fileNameOf = (path: string) => path.split(/[\\/]/).at(-1) ?? path;

/** Running and finished renders, newest first; lives in the header's popover. */
export function RenderList({ jobs }: { jobs: readonly RenderJob[] }) {
  if (jobs.length === 0) {
    return <p className="text-muted-foreground text-sm">{de.render.list.empty}</p>;
  }
  return (
    <ul aria-label={de.render.list.title} className="-my-1 max-h-[60vh] divide-y overflow-y-auto">
      {[...jobs].reverse().map((job) => (
        <JobRow key={job.id} job={job} />
      ))}
    </ul>
  );
}

function JobRow({ job }: { job: RenderJob }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState<string>();
  const finished = isRenderJobFinished(job.state);
  const name = fileNameOf(job.outputPath);
  const { aspect, resolution, fps } = job.output;

  async function cancelOrRemove() {
    const changed = await api.cancelRender(job.id);
    if (changed) storeRenderJob(queryClient, changed);
    else
      queryClient.setQueryData<RenderJob[]>(RENDERS_KEY, (jobs = []) =>
        jobs.filter(({ id }) => id !== job.id),
      );
  }

  async function copyPath() {
    await navigator.clipboard.writeText(job.outputPath);
    setNote(de.render.list.copied);
  }

  async function reveal() {
    try {
      await api.revealRender(job.id);
    } catch (error) {
      // Outside Windows the server cannot open a folder; the path is the next best thing.
      if (!(error instanceof ApiError && error.status === 501)) throw error;
      await navigator.clipboard.writeText(job.outputPath);
      setNote(de.render.list.revealUnsupported);
    }
  }

  return (
    <li className="space-y-1.5 py-2 text-sm">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium" title={job.outputPath}>
            {name}
          </p>
          <p className="text-muted-foreground truncate text-xs">
            {job.video
              ? formatVideo(job.video)
              : `${job.etappeName} · ${aspect} · ${resolution} · ${fps} fps`}
          </p>
        </div>
        {finished ? (
          <ActionButton label={de.render.list.remove} onClick={cancelOrRemove}>
            <X />
          </ActionButton>
        ) : (
          <ActionButton label={de.render.list.cancel} onClick={cancelOrRemove}>
            <Square />
          </ActionButton>
        )}
      </div>

      {!finished && <Progress job={job} />}
      {job.state === 'done' && (
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground mr-auto text-xs">
            {de.render.list.states.done}
            {job.startedAt && job.finishedAt
              ? ` ${de.render.list.took(formatDuration(Date.parse(job.finishedAt) - Date.parse(job.startedAt)))}`
              : ''}
          </span>
          <Button variant="outline" size="xs" onClick={() => void reveal()}>
            <FolderOpen /> {de.render.list.reveal}
          </Button>
          <Button variant="outline" size="xs" onClick={() => void copyPath()}>
            <Copy /> {de.render.list.copyPath}
          </Button>
        </div>
      )}
      {job.state === 'failed' && (
        <p className="text-destructive text-xs">
          {de.render.list.states.failed}: {job.error}
        </p>
      )}
      {job.state === 'cancelled' && (
        <p className="text-muted-foreground text-xs">{de.render.list.states.cancelled}</p>
      )}
      {note && (
        <p role="status" className="text-muted-foreground text-xs">
          {note}
        </p>
      )}
    </li>
  );
}

function Progress({ job }: { job: RenderJob }) {
  // Before the first frame Remotion opens its browser and reads the composition.
  const starting = job.state === 'rendering' && job.progress === 0 && job.remainingMs === null;
  const label =
    job.state === 'rendering' && !starting
      ? `${de.render.list.states.rendering} ${Math.round(job.progress * 100)} %`
      : starting
        ? de.render.list.starting
        : de.render.list.states[job.state];
  const remaining =
    job.state === 'rendering' && job.remainingMs !== null && job.remainingMs > 0
      ? de.render.list.remaining(formatDuration(job.remainingMs))
      : null;
  // A waiting job has an empty bar; while it prepares or starts, a faint pulsing one says
  // that something is happening, without pretending to know how far.
  const busy = job.state === 'preparing' || starting;

  return (
    <div className="space-y-1">
      <div
        role="progressbar"
        aria-label={job.etappeName}
        aria-valuemin={0}
        aria-valuemax={100}
        {...(job.state === 'rendering' &&
          !starting && { 'aria-valuenow': Math.round(job.progress * 100) })}
        className="bg-muted h-1.5 overflow-hidden rounded-full"
      >
        <div
          className={cn('h-full rounded-full', busy ? 'bg-primary/40 animate-pulse' : 'bg-primary')}
          style={{ width: busy ? '100%' : `${job.progress * 100}%` }}
        />
      </div>
      <p className="text-muted-foreground flex justify-between text-xs">
        <span>{label}</span>
        {remaining && <span>{remaining}</span>}
      </p>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => Promise<void>;
  children: ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      title={label}
      onClick={() => void onClick()}
    >
      {children}
    </Button>
  );
}
