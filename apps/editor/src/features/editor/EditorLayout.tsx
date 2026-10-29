import { useState } from 'react';
import { useDefaultLayout } from 'react-resizable-panels';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Inspector } from '@/features/inspector/Inspector';
import { EditMap } from '@/features/map/EditMap';
import { createPlayerBridge, PlayerBridgeContext } from '@/features/preview/playerBridge';
import { PreviewPane } from '@/features/preview/PreviewPane';
import { Timeline } from '@/features/timeline/Timeline';
import { ProjectTree } from '@/features/tree/ProjectTree';
import { layoutStorage } from '@/state/uiState';
import { useEditor } from '@/state/editorStore';
import { EditorHeader } from './EditorHeader';
import { useEditorShortcuts } from './useEditorShortcuts';

/** Like an editing app: structure left, picture in the middle, properties right, time below. */
export function EditorLayout() {
  const [bridge] = useState(createPlayerBridge);
  useEditorShortcuts(bridge);
  const workspace = useEditor((state) => state.workspace);
  // The panel sizes are a preference for the workspace, not for one project, so they are
  // remembered once for all projects.
  const columns = useDefaultLayout({ id: 'editor-columns', storage: layoutStorage });
  const center = useDefaultLayout({ id: 'editor-center', storage: layoutStorage });

  return (
    <PlayerBridgeContext.Provider value={bridge}>
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
                {/* Only one of them at a time: each holds its own WebGL map. */}
                {workspace === 'edit' ? <EditMap /> : <PreviewPane />}
              </ResizablePanel>
              <ResizableHandle />
              <ResizablePanel id="timeline" defaultSize="25" minSize="10" className="bg-card">
                <Timeline />
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel id="inspector" defaultSize="22" minSize="16" className="bg-card">
            <Inspector />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </PlayerBridgeContext.Provider>
  );
}
