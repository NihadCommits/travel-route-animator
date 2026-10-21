import { useMemo, useSyncExternalStore } from 'react';

// Two screens only, addressed by the URL hash: "#/" for the overview and "#/projekt/<id>" for
// the editor. A hash keeps working when the app is later loaded from a file inside Electron
// (ADR 0003), where there is no server to answer deep links.

export type Route = { name: 'overview' } | { name: 'editor'; projectId: string };

const EDITOR_HASH = /^#\/projekt\/([^/]+)$/;

export function parseHash(hash: string): Route {
  const match = EDITOR_HASH.exec(hash);
  return match
    ? { name: 'editor', projectId: decodeURIComponent(match[1]!) }
    : { name: 'overview' };
}

export function hrefFor(route: Route): string {
  return route.name === 'editor' ? `#/projekt/${encodeURIComponent(route.projectId)}` : '#/';
}

export function navigate(route: Route): void {
  window.location.hash = hrefFor(route);
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return useMemo(() => parseHash(hash), [hash]);
}
