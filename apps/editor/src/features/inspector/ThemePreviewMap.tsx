import type { LngLat, Theme } from '@travel-route-animator/core';
import { buildStyle } from '@travel-route-animator/styles';
import { useEffect, useMemo, useRef, useState } from 'react';
import { de } from '@/i18n/de';
import type { MapLibreMap } from '@/features/map/maplibre';

/**
 * A small live map in a theme's look, for the theme editor. A changed colour reaches it as a
 * style diff: plain base layers, nothing of ours that a diff could drop.
 */
export function ThemePreviewMap({ theme, center }: { theme: Theme; center: LngLat }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const style = useMemo(() => buildStyle({ base: 'vector' }, theme), [theme]);
  const first = useRef({ style, center });

  useEffect(() => {
    let map: MapLibreMap | undefined;
    let cancelled = false;
    void import('@/features/map/maplibre')
      .then(({ createThemePreviewMap }) => {
        if (cancelled || !containerRef.current) return;
        map = createThemePreviewMap(
          containerRef.current,
          first.current.style,
          first.current.center,
        );
        mapRef.current = map;
      })
      .catch(() => setUnavailable(true));
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    mapRef.current?.setStyle(style, { diff: true });
  }, [style]);

  return unavailable ? (
    <p className="bg-muted text-muted-foreground flex h-72 items-center justify-center rounded text-xs">
      {de.inspector.themeEditor.previewUnavailable}
    </p>
  ) : (
    <div ref={containerRef} className="h-72 overflow-hidden rounded border" />
  );
}
