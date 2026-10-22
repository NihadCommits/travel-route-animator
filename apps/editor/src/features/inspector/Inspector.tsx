import { locateItem } from '@travel-route-animator/core';
import { de } from '@/i18n/de';
import { selectProject, useEditor } from '@/state/editorStore';
import { EtappeForm } from './EtappeForm';
import { GroupForm } from './GroupForm';
import { ProjectForm } from './ProjectForm';
import { TrackForm } from './TrackForm';

/**
 * Properties of the selected item, edited in place (ADR 0004). Without a selection it shows
 * the project. Each form is keyed by its item: switching the selection then starts with fresh
 * fields instead of carrying half-typed text over to another item.
 */
export function Inspector() {
  const selectedId = useEditor((state) => state.selectedId);
  return (
    <section aria-label={de.inspector.title} className="flex h-full flex-col">
      <header className="text-muted-foreground flex h-8 items-center px-3 text-[11px] font-semibold tracking-wider uppercase">
        {de.inspector.title}
      </header>
      {/* Native scrolling, vertical only: long names are truncated instead of widening the panel.
          Keyed by the selection, so another item starts at the top instead of the old position. */}
      <div key={selectedId} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className="space-y-3 px-3 pb-4">
          <SelectedForm />
        </div>
      </div>
    </section>
  );
}

function SelectedForm() {
  const project = useEditor(selectProject);
  const selectedId = useEditor((state) => state.selectedId);
  const location = selectedId === null ? undefined : locateItem(project, selectedId);

  if (!location || location.kind === 'project') {
    return <ProjectForm key={project.id} project={project} />;
  }
  const group = project.groups[location.groupIndex]!;
  if (location.kind === 'group') {
    return <GroupForm key={group.id} group={group} location={location} />;
  }
  const etappe = group.etappen[location.etappeIndex]!;
  if (location.kind === 'etappe') {
    return <EtappeForm key={etappe.id} etappe={etappe} location={location} />;
  }
  const track = etappe.tracks[location.trackIndex]!;
  return <TrackForm key={track.id} track={track} etappe={etappe} location={location} />;
}
