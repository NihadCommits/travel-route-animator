import { EditorScreen } from '@/features/editor/EditorScreen';
import { ProjectOverview } from '@/features/overview/ProjectOverview';
import { DesktopSettingsHost } from '@/features/settings/DesktopSettings';
import { useRoute } from '@/lib/router';

export function App() {
  const route = useRoute();
  return (
    <>
      {/* Keyed by project so switching projects starts from a clean editor state. */}
      {route.name === 'editor' ? (
        <EditorScreen key={route.projectId} projectId={route.projectId} />
      ) : (
        <ProjectOverview />
      )}
      <DesktopSettingsHost />
    </>
  );
}
