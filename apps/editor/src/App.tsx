import { EditorScreen } from '@/features/editor/EditorScreen';
import { ProjectOverview } from '@/features/overview/ProjectOverview';
import { useRoute } from '@/lib/router';

export function App() {
  const route = useRoute();
  // Keyed by project so switching projects starts from a clean editor state.
  return route.name === 'editor' ? (
    <EditorScreen key={route.projectId} projectId={route.projectId} />
  ) : (
    <ProjectOverview />
  );
}
