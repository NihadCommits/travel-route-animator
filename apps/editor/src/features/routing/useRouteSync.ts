import { useEffect } from 'react';
import type { StoreApi } from 'zustand';
import { api } from '@/lib/api';
import type { EditorState } from '@/state/editorStore';
import { startRouteSync } from './routeSync';

/** Road routes follow the project while the editor is open (see routeSync.ts). */
export function useRouteSync(store: StoreApi<EditorState>): void {
  useEffect(() => startRouteSync(store, { computeRoute: api.computeRoute }), [store]);
}
