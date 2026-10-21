import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** Placeholder until the editor store and layout land in the next steps. */
export function EditorScreen({ projectId }: { projectId: string }) {
  const project = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.getProject(projectId),
  });
  return (
    <main className="p-6">
      <a href="#/" className="text-primary text-xs">
        ←
      </a>
      <h1 className="text-xl font-semibold">{project.data?.name}</h1>
    </main>
  );
}
