import type { Project } from '@travel-route-animator/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { de } from '@/i18n/de';
import { translateIssue } from '@/i18n/issues';
import { api, ApiError } from '@/lib/api';
import { createEditorStore, EditorStoreContext, type EditorStore } from '@/state/editorStore';
import { loadUiState, rememberUiState } from '@/state/uiState';
import { PROJECTS_QUERY_KEY } from '@/features/overview/ProjectOverview';
import { useElevationSync } from '@/features/elevation/useElevationSync';
import { useRouteSync } from '@/features/routing/useRouteSync';
import { EditorLayout } from './EditorLayout';

export function EditorScreen({ projectId }: { projectId: string }) {
  const project = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.getProject(projectId),
    // The editor store owns the project from here on; never swap it under the user's hands.
    staleTime: Infinity,
    retry: false,
  });

  if (project.isPending) return <Message>{de.editor.loading}</Message>;
  if (project.isError) return <LoadError error={project.error} />;
  return <LoadedEditor project={project.data} />;
}

function LoadedEditor({ project }: { project: Project }) {
  const queryClient = useQueryClient();
  const [editor] = useState<EditorStore>(() =>
    createEditorStore(project, {
      save: async (next) => {
        await api.saveProject(next);
        // The overview shows names and dates; let it refetch next time.
        void queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
      },
      ui: loadUiState(project.id),
    }),
  );

  useEffect(() => rememberUiState(editor.store, project.id), [editor, project.id]);
  useRouteSync(editor.store);
  useElevationSync(editor.store);

  useEffect(() => {
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (editor.autosave.hasUnsavedChanges()) event.preventDefault();
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => {
      window.removeEventListener('beforeunload', warnBeforeLeaving);
      // Leaving the editor (e.g. back to the overview) saves right away instead of waiting.
      void editor.autosave.flush();
    };
  }, [editor]);

  return (
    <EditorStoreContext.Provider value={editor.store}>
      <EditorLayout />
    </EditorStoreContext.Provider>
  );
}

function LoadError({ error }: { error: Error }) {
  const body = error instanceof ApiError ? error.body : undefined;
  return (
    <Message>
      {error instanceof ApiError && error.status === 422 ? (
        <>
          <p>{de.editor.invalidFile}</p>
          <ul className="mt-2 list-disc pl-5 text-left text-xs">
            {body?.issues?.map((issue) => (
              <li key={issue.path + issue.message}>
                {issue.path && <code>{issue.path}: </code>}
                {translateIssue(issue)}
              </li>
            ))}
          </ul>
        </>
      ) : error instanceof ApiError && error.status === 404 ? (
        de.editor.notFound
      ) : (
        de.overview.serverDown
      )}
    </Message>
  );
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 p-6">
      <div role="status" className="text-muted-foreground">
        {children}
      </div>
      <a href="#/" className="text-primary text-sm">
        ← {de.editor.backToProjects}
      </a>
    </main>
  );
}
