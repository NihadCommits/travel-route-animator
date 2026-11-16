import type { OverlayStyle } from '@travel-route-animator/core';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

// Own overlay styles (M17) come from the server, shared by the inspector and the preview.

export const OVERLAY_STYLES_QUERY_KEY = ['overlay-styles'] as const;
const NONE: readonly OverlayStyle[] = [];

/** Own overlay styles; empty while loading or when the server cannot be reached. */
export function useOwnOverlayStyles(): readonly OverlayStyle[] {
  const query = useQuery({ queryKey: OVERLAY_STYLES_QUERY_KEY, queryFn: api.listOverlayStyles });
  return query.data ?? NONE;
}
