import { checkEtappeReadiness, locateItem, type Project } from '@travel-route-animator/core';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import { de } from '@/i18n/de';
import { translateIssue } from '@/i18n/issues';
import { selectProject, useEditor } from '@/state/editorStore';

/**
 * M2a: shows what is selected and whether it can be rendered. The editing forms for project,
 * group, stage and track follow in M2b.
 */
export function Inspector() {
  const project = useEditor(selectProject);
  const selectedId = useEditor((state) => state.selectedId);

  return (
    <section aria-label={de.inspector.title} className="flex h-full flex-col">
      <header className="text-muted-foreground flex h-8 items-center px-3 text-[11px] font-semibold tracking-wider uppercase">
        {de.inspector.title}
      </header>
      {/* Native scrolling, vertical only: long names are truncated instead of widening the panel. */}
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className="space-y-4 px-3 pb-4">
          {selectedId === null ? (
            <p className="text-muted-foreground">{de.inspector.nothingSelected}</p>
          ) : (
            <SelectionDetails project={project} id={selectedId} />
          )}
        </div>
      </div>
    </section>
  );
}

function SelectionDetails({ project, id }: { project: Project; id: string }) {
  const location = locateItem(project, id);
  if (!location || location.kind === 'project') return null;

  const group = project.groups[location.groupIndex]!;
  const etappe = location.kind === 'group' ? undefined : group.etappen[location.etappeIndex]!;
  const track = location.kind === 'track' ? etappe!.tracks[location.trackIndex]! : undefined;
  const name =
    track?.label ?? (track ? de.vehicles[track.vehicle.type] : (etappe?.name ?? group.name));

  const issues = etappe ? checkEtappeReadiness(etappe) : [];
  const relevant =
    location.kind === 'track'
      ? issues.filter((issue) => issue.path.startsWith(`tracks[${location.trackIndex}]`))
      : issues;

  return (
    <>
      <div>
        <p className="text-muted-foreground text-xs">{de.inspector.kinds[location.kind]}</p>
        <p className="text-base font-semibold">{name || de.tree.unnamed}</p>
      </div>

      {etappe &&
        (relevant.length === 0 ? (
          <p className="text-muted-foreground flex items-center gap-2">
            <CircleCheck className="size-4 text-emerald-500" /> {de.inspector.ready}
          </p>
        ) : (
          <div className="border-warning/40 bg-warning/10 rounded-md border p-2">
            <p className="text-warning flex items-center gap-2 font-medium">
              <TriangleAlert className="size-4" /> {de.tree.notReady}
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {relevant.map((issue) => (
                <li key={issue.path + issue.code}>{translateIssue(issue)}</li>
              ))}
            </ul>
          </div>
        ))}

      {track && (
        <div>
          <p className="text-muted-foreground mb-1 text-xs">{de.inspector.waypoints}</p>
          {track.waypoints.length === 0 ? (
            <p className="text-muted-foreground">{de.inspector.noWaypoints}</p>
          ) : (
            <ol className="space-y-1">
              {track.waypoints.map((waypoint) => (
                <li key={waypoint.id} className="flex items-baseline justify-between gap-2">
                  <span className="truncate">{waypoint.name || de.tree.unnamed}</span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {de.inspector.waypointKinds[waypoint.kind]} · {waypoint.lngLat[0].toFixed(4)},{' '}
                    {waypoint.lngLat[1].toFixed(4)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      <p className="text-muted-foreground border-t pt-3 text-xs">{de.inspector.formsFollow}</p>
    </>
  );
}
