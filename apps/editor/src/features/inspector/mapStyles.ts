import type { Theme } from '@travel-route-animator/core';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '@/lib/api';

// Own map themes and what the server offers, shared by the inspector and the preview.

export const THEMES_QUERY_KEY = ['themes'] as const;
const NO_THEMES: Readonly<Record<string, Theme>> = {};

/** Own themes by ID; empty while loading or when the server cannot be reached. */
export function useOwnThemes(): Readonly<Record<string, Theme>> {
  const query = useQuery({ queryKey: THEMES_QUERY_KEY, queryFn: api.listThemes });
  const list = query.data;
  return useMemo(
    () => (list ? Object.fromEntries(list.map((theme) => [theme.id, theme])) : NO_THEMES),
    [list],
  );
}

/** Satellite needs a key on the server; until the answer is in, it counts as off. */
export function useSatelliteAvailable(): boolean {
  const query = useQuery({ queryKey: ['capabilities'], queryFn: api.capabilities });
  return query.data?.satellite ?? false;
}
