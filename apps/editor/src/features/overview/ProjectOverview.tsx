import { renameItem } from '@travel-route-animator/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderOpen, MoreHorizontal, Plus, Settings } from 'lucide-react';
import { useState } from 'react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { openDesktopSettings } from '@/features/settings/DesktopSettings';
import { de, formatDateTime } from '@/i18n/de';
import { api, type ProjectSummary } from '@/lib/api';
import { desktopBridge } from '@/lib/desktop';
import { navigate } from '@/lib/router';
import { NameDialog } from './NameDialog';

export const PROJECTS_QUERY_KEY = ['projects'];

type DialogState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'rename'; project: ProjectSummary }
  | { kind: 'delete'; project: ProjectSummary };

export function ProjectOverview() {
  const queryClient = useQueryClient();
  const projects = useQuery({ queryKey: PROJECTS_QUERY_KEY, queryFn: api.listProjects });
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const close = () => setDialog({ kind: 'none' });
  const refresh = () => queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });

  const create = useMutation({
    mutationFn: api.createProject,
    onSuccess: async (project) => {
      await refresh();
      navigate({ name: 'editor', projectId: project.id });
    },
  });

  // Renaming needs the full project: the server only accepts complete, validated projects.
  const rename = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) =>
      api.saveProject(renameItem(await api.getProject(id), id, name)),
    onSuccess: refresh,
  });

  const remove = useMutation({ mutationFn: api.deleteProject, onSuccess: refresh });

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-xs tracking-wide uppercase">{de.app.title}</p>
          <h1 className="text-2xl font-semibold">{de.overview.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* The Windows app keeps what .env holds in the web version in its settings. */}
          {desktopBridge() && (
            <Button variant="outline" onClick={openDesktopSettings}>
              <Settings /> {de.settings.open}
            </Button>
          )}
          <Button onClick={() => setDialog({ kind: 'create' })}>
            <Plus /> {de.overview.newProject}
          </Button>
        </div>
      </header>

      {projects.isPending && <p className="text-muted-foreground">{de.overview.loading}</p>}
      {projects.isError && (
        <div role="alert" className="border-destructive/50 rounded-lg border p-4">
          <p className="text-destructive">{de.overview.serverDown}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void refresh()}>
            {de.common.retry}
          </Button>
        </div>
      )}
      {projects.data?.length === 0 && (
        <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center">
          {de.overview.empty}
        </p>
      )}

      {projects.data && projects.data.length > 0 && (
        <ul className="bg-card divide-border divide-y rounded-lg border">
          {projects.data.map((project) => (
            <li key={project.id} className="hover:bg-accent/50 flex items-center gap-2 pr-2">
              <a
                href={`#/projekt/${encodeURIComponent(project.id)}`}
                className="flex flex-1 items-center gap-3 px-4 py-3 outline-none focus-visible:ring-2"
              >
                <FolderOpen className="text-muted-foreground size-4" />
                <span className="flex flex-col">
                  <span className="font-medium">{project.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {de.overview.lastChanged(formatDateTime(project.updatedAt))}
                  </span>
                </span>
              </a>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${de.common.actions}: ${project.name}`}
                  >
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setDialog({ kind: 'rename', project })}>
                    {de.common.rename}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setDialog({ kind: 'delete', project })}
                  >
                    {de.common.delete}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      <NameDialog
        open={dialog.kind === 'create'}
        title={de.overview.newTitle}
        submitLabel={de.common.create}
        onOpenChange={(open) => !open && close()}
        onSubmit={(name) => create.mutateAsync(name)}
      />
      <NameDialog
        open={dialog.kind === 'rename'}
        title={de.overview.renameTitle}
        submitLabel={de.common.rename}
        initialName={dialog.kind === 'rename' ? dialog.project.name : ''}
        onOpenChange={(open) => !open && close()}
        onSubmit={(name) =>
          dialog.kind === 'rename'
            ? rename.mutateAsync({ id: dialog.project.id, name })
            : Promise.resolve()
        }
      />
      <AlertDialog open={dialog.kind === 'delete'} onOpenChange={(open) => !open && close()}>
        {dialog.kind === 'delete' && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{de.overview.deleteTitle(dialog.project.name)}</AlertDialogTitle>
              <AlertDialogDescription>{de.overview.deleteDescription}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{de.common.cancel}</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => remove.mutate(dialog.project.id)}
              >
                {de.common.delete}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </main>
  );
}
