import { lazy, Suspense } from 'react';
import { de } from '@/i18n/de';
import { selectEtappeId, selectGroupId, selectProject, useEditor } from '@/state/editorStore';

// Player, scene and Remotion load only once the preview is opened, like the map library for
// the edit map, and tests can replace the module (jsdom has no WebGL).
const PreviewPlayer = lazy(() =>
  import('./PreviewPlayer').then((module) => ({ default: module.PreviewPlayer })),
);

/**
 * The middle of the editor in preview mode: the stage of the selection as it will render, or
 * a selected group as one video (ADR 0011).
 */
export function PreviewPane() {
  const etappeId = useEditor(selectEtappeId);
  const groupId = useEditor(selectGroupId);
  const groupHasStages = useEditor((state) =>
    selectProject(state).groups.some((g) => g.id === groupId && g.etappen.length > 0),
  );
  const target =
    etappeId !== null
      ? ({ kind: 'etappe', id: etappeId } as const)
      : groupId !== null && groupHasStages
        ? ({ kind: 'group', id: groupId } as const)
        : null;
  if (target === null) return <Placeholder text={de.preview.pickEtappe} />;
  return (
    <Suspense fallback={<Placeholder text={de.preview.loading} />}>
      {/* A new stage or group gets a new player: it starts at its own position. */}
      <PreviewPlayer key={target.id} target={target} />
    </Suspense>
  );
}

function Placeholder({ text }: { text: string }) {
  return (
    <div className="text-muted-foreground flex h-full items-center justify-center p-4 text-center">
      {text}
    </div>
  );
}
