import {
  addEtappe,
  addGroup,
  addTrack,
  checkEtappeReadiness,
  duplicateItem,
  removeItem,
  renameItem,
  type Id,
  type ReadinessIssue,
} from '@travel-route-animator/core';
import { Folder, Plus, Route } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { VEHICLE_ICONS } from '@/features/editor/vehicleIcons';
import { de } from '@/i18n/de';
import { translateIssue } from '@/i18n/issues';
import { selectProject, useEditor } from '@/state/editorStore';
import { TreeRow } from './TreeRow';
import { VehiclePicker } from './VehiclePicker';

interface PendingDelete {
  id: Id;
  name: string;
  description: string;
}

export function ProjectTree() {
  const project = useEditor(selectProject);
  const selectedId = useEditor((state) => state.selectedId);
  const apply = useEditor((state) => state.apply);
  const add = useEditor((state) => state.add);
  const select = useEditor((state) => state.select);

  // Everything starts expanded; only what the user closes is remembered.
  const [collapsed, setCollapsed] = useState<ReadonlySet<Id>>(new Set());
  const [renamingId, setRenamingId] = useState<Id | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [vehicleForEtappe, setVehicleForEtappe] = useState<Id | null>(null);

  const readiness = useMemo(() => {
    const byEtappe = new Map<Id, ReadinessIssue[]>();
    for (const group of project.groups) {
      for (const etappe of group.etappen) byEtappe.set(etappe.id, checkEtappeReadiness(etappe));
    }
    return byEtappe;
  }, [project]);

  const setExpanded = (id: Id, open: boolean) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (open) next.delete(id);
      else next.add(id);
      return next;
    });

  function rowHandlers(id: Id, name: string, deleteInfo?: PendingDelete) {
    return {
      selected: selectedId === id,
      onSelect: () => select(id),
      renaming: renamingId === id,
      onStartRename: () => setRenamingId(id),
      onRename: (newName: string) => {
        setRenamingId(null);
        if (newName !== name) apply((p) => renameItem(p, id, newName));
      },
      onCancelRename: () => setRenamingId(null),
      onDuplicate: () => add((p) => duplicateItem(p, id, { nameSuffix: de.common.copySuffix })),
      onDelete: () => (deleteInfo ? setPendingDelete(deleteInfo) : apply((p) => removeItem(p, id))),
    };
  }

  function addNewGroup() {
    const id = add((p) => addGroup(p, de.tree.newGroupName));
    setRenamingId(id);
  }

  return (
    <section aria-label={de.tree.label} className="flex h-full flex-col">
      <header className="text-muted-foreground flex h-8 items-center px-3 text-[11px] font-semibold tracking-wider uppercase">
        {de.tree.label}
      </header>
      {/* Native scrolling, vertical only: long names are truncated instead of widening the panel. */}
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        {project.groups.length === 0 ? (
          <p className="text-muted-foreground px-3 py-2">{de.tree.emptyProject}</p>
        ) : (
          <ul role="tree" aria-label={de.tree.label} className="pb-2">
            {project.groups.map((group) => (
              <TreeRow
                key={group.id}
                level={1}
                label={group.name}
                icon={<Folder style={group.color ? { color: group.color } : undefined} />}
                expanded={!collapsed.has(group.id)}
                onToggle={() => setExpanded(group.id, collapsed.has(group.id))}
                add={{
                  label: de.tree.addEtappe,
                  onAdd: () => {
                    setExpanded(group.id, true);
                    const id = add((p) => addEtappe(p, group.id, de.tree.newEtappeName));
                    setRenamingId(id);
                  },
                }}
                {...rowHandlers(group.id, group.name, {
                  id: group.id,
                  name: group.name,
                  description: de.tree.deleteGroupDescription(group.etappen.length),
                })}
              >
                {group.etappen.length === 0 ? (
                  <EmptyHint level={2} text={de.tree.emptyGroup} />
                ) : (
                  group.etappen.map((etappe) => {
                    const issues = readiness.get(etappe.id) ?? [];
                    return (
                      <TreeRow
                        key={etappe.id}
                        level={2}
                        label={etappe.name}
                        icon={<Route />}
                        expanded={!collapsed.has(etappe.id)}
                        onToggle={() => setExpanded(etappe.id, collapsed.has(etappe.id))}
                        warnings={issues
                          .filter((issue) => !issue.path.startsWith('tracks['))
                          .map(translateIssue)}
                        add={{
                          label: de.tree.addTrack,
                          onAdd: () => setVehicleForEtappe(etappe.id),
                        }}
                        {...rowHandlers(etappe.id, etappe.name, {
                          id: etappe.id,
                          name: etappe.name,
                          description: de.tree.deleteEtappeDescription(etappe.tracks.length),
                        })}
                      >
                        {etappe.tracks.length === 0 ? (
                          <EmptyHint level={3} text={de.tree.emptyEtappe} />
                        ) : (
                          etappe.tracks.map((track, t) => {
                            const Icon = VEHICLE_ICONS[track.vehicle.type];
                            const label = track.label ?? de.vehicles[track.vehicle.type];
                            return (
                              <TreeRow
                                key={track.id}
                                level={3}
                                label={label}
                                icon={<Icon style={{ color: track.style.lineColor }} />}
                                warnings={issues
                                  .filter((issue) => issue.path.startsWith(`tracks[${t}]`))
                                  .map(translateIssue)}
                                {...rowHandlers(track.id, label)}
                              />
                            );
                          })
                        )}
                      </TreeRow>
                    );
                  })
                )}
              </TreeRow>
            ))}
          </ul>
        )}
      </div>
      <footer className="border-t p-2">
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={addNewGroup}>
          <Plus /> {de.tree.addGroup}
        </Button>
      </footer>

      <VehiclePicker
        open={vehicleForEtappe !== null}
        onOpenChange={(open) => !open && setVehicleForEtappe(null)}
        onPick={(vehicle) => {
          if (vehicleForEtappe === null) return;
          const etappeId = vehicleForEtappe;
          setExpanded(etappeId, true);
          add((p) => addTrack(p, etappeId, vehicle, { label: de.vehicles[vehicle] }));
        }}
      />

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        {pendingDelete && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {de.tree.deleteTitle(pendingDelete.name || de.tree.unnamed)}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {pendingDelete.description} {de.tree.undoHint}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{de.common.cancel}</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => apply((p) => removeItem(p, pendingDelete.id))}
              >
                {de.common.delete}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </section>
  );
}

function EmptyHint({ level, text }: { level: number; text: string }) {
  return (
    <li
      role="none"
      className="text-muted-foreground h-7 truncate leading-7 italic"
      style={{ paddingLeft: 4 + (level - 1) * 14 + 22 }}
    >
      {text}
    </li>
  );
}
