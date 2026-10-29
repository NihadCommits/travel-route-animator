import { lazy, Suspense } from 'react';
import { de } from '@/i18n/de';
import { selectEtappeId, useEditor } from '@/state/editorStore';

// Player, scene and Remotion load only once the preview is opened, like the map library for
// the edit map, and tests can replace the module (jsdom has no WebGL).
const PreviewPlayer = lazy(() =>
  import('./PreviewPlayer').then((module) => ({ default: module.PreviewPlayer })),
);

/** The middle of the editor in preview mode: the stage of the selection, as it will render. */
export function PreviewPane() {
  const etappeId = useEditor(selectEtappeId);
  if (etappeId === null) return <Placeholder text={de.preview.pickEtappe} />;
  return (
    <Suspense fallback={<Placeholder text={de.preview.loading} />}>
      {/* A new stage gets a new player: it starts at that stage's own position. */}
      <PreviewPlayer key={etappeId} etappeId={etappeId} />
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
