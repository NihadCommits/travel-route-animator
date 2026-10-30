import { isRenderJobFinished } from '@travel-route-animator/core';
import { Clapperboard, ListVideo } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { de } from '@/i18n/de';
import { selectEtappeId, useEditor } from '@/state/editorStore';
import { RenderDialog } from './RenderDialog';
import { RenderList } from './RenderList';
import { useRenderJobStream, useRenderJobs } from './renderJobs';

/** "Rendern" and the render list in the header (UI-Konzept). */
export function RenderControls() {
  const etappeId = useEditor(selectEtappeId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const { data: jobs = [] } = useRenderJobs();
  const active = jobs.filter((job) => !isRenderJobFinished(job.state));

  return (
    <>
      {/* Followed while they run, also with the list closed: the counter shows them. */}
      {active.map((job) => (
        <JobStream key={job.id} id={job.id} />
      ))}
      <Tooltip>
        <TooltipTrigger asChild>
          {/* The span keeps the tooltip working on a disabled button. */}
          <span>
            <Button size="sm" disabled={etappeId === null} onClick={() => setDialogOpen(true)}>
              <Clapperboard /> {de.render.open}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {etappeId === null ? de.render.pickEtappe : de.render.openHint}
        </TooltipContent>
      </Tooltip>
      <Popover open={listOpen} onOpenChange={setListOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={de.render.list.open}
            className="relative"
          >
            <ListVideo />
            {active.length > 0 && (
              <span
                aria-label={de.render.list.running(active.length)}
                className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full text-[9px] font-semibold"
              >
                {active.length}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent>
          <h2 className="mb-2 text-sm font-semibold">{de.render.list.title}</h2>
          <RenderList jobs={jobs} />
        </PopoverContent>
      </Popover>
      {etappeId !== null && (
        <RenderDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          etappeId={etappeId}
          onStarted={() => setListOpen(true)}
        />
      )}
    </>
  );
}

function JobStream({ id }: { id: string }) {
  useRenderJobStream(id);
  return null;
}
