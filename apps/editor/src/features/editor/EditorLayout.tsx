import { useDefaultLayout } from 'react-resizable-panels';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Inspector } from '@/features/inspector/Inspector';
import { ProjectTree } from '@/features/tree/ProjectTree';
import { de } from '@/i18n/de';
import { layoutStorage } from '@/state/uiState';
import { EditorHeader } from './EditorHeader';
import { useEditorShortcuts } from './useEditorShortcuts';

/** Like an editing app: structure left, picture in the middle, properties right, time below. */
export function EditorLayout() {
  useEditorShortcuts();
  // The panel sizes are a preference for the workspace, not for one project, so they are
  // remembered once for all projects.
  const columns = useDefaultLayout({ id: 'editor-columns', storage: layoutStorage });
  const center = useDefaultLayout({ id: 'editor-center', storage: layoutStorage });

  return (
    <div className="flex h-screen flex-col">
      <EditorHeader />
      <ResizablePanelGroup
        orientation="horizontal"
        className="min-h-0 flex-1"
        defaultLayout={columns.defaultLayout}
        onLayoutChanged={columns.onLayoutChanged}
      >
        <ResizablePanel id="tree" defaultSize="22" minSize="14" className="bg-card">
          <ProjectTree />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel id="center" defaultSize="56" minSize="30">
          <ResizablePanelGroup
            orientation="vertical"
            defaultLayout={center.defaultLayout}
            onLayoutChanged={center.onLayoutChanged}
          >
            <ResizablePanel id="workspace" defaultSize="75" minSize="30">
              <Placeholder text={de.editor.workspacePlaceholder} />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel id="timeline" defaultSize="25" minSize="10" className="bg-card">
              <Placeholder text={de.editor.timelinePlaceholder} />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel id="inspector" defaultSize="22" minSize="16" className="bg-card">
          <Inspector />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

function Placeholder({ text }: { text: string }) {
  return (
    <div className="text-muted-foreground flex h-full items-center justify-center p-4 text-center">
      {text}
    </div>
  );
}
