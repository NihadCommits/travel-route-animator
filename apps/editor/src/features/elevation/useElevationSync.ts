import { useEffect } from 'react';
import type { StoreApi } from 'zustand';
import { api } from '@/lib/api';
import type { EditorState } from '@/state/editorStore';
import { startElevationSync } from './elevationSync';

/** Heights follow the routes while the editor is open (see elevationSync.ts). */
export function useElevationSync(store: StoreApi<EditorState>): void {
  useEffect(() => startElevationSync(store, { sampleElevation: api.sampleElevation }), [store]);
}
