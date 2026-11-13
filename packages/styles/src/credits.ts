import {
  findEtappe,
  mapOptionsOf,
  resolveMapStyle,
  resolveOutput,
  routingCredits,
  type Id,
  type MapOptions,
  type MapStyleRef,
  type OutputSettings,
  type Project,
  type Theme,
} from '@travel-route-animator/core';
import { resolveTheme } from './themes';

/** Credits OpenFreeMap asks for wherever its tiles are shown, including rendered videos. */
export const OPENFREEMAP_ATTRIBUTION = 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap';
/** The shaded relief some themes show at low zoom (public domain; credited out of courtesy). */
export const NATURAL_EARTH_ATTRIBUTION = 'Natural Earth';
/** MapTiler's satellite imagery; its terms ask for this text wherever the tiles are shown. */
export const MAPTILER_ATTRIBUTION = '© MapTiler © OpenStreetMap contributors';
/**
 * AWS Terrain Tiles (ADR 0012), short enough for the corner of a video. The full list of
 * sources is in tilezen/joerd's docs/attribution.md; the main ones for Europe are named.
 */
export const TERRAIN_ATTRIBUTION =
  'Terrain: Mapzen, USGS SRTM/GMTED, EU-DEM © Copernicus, DGM Österreich and others';

/** The credits for the sources a style draws from, each once, in a stable order. */
export function styleCredits(style: MapStyleRef, theme: Theme): string[] {
  if (style.base === 'satellite') return [MAPTILER_ATTRIBUTION];
  if (style.base === 'satellite-hybrid') return [MAPTILER_ATTRIBUTION, OPENFREEMAP_ATTRIBUTION];
  const credits = theme.layers.relief
    ? [OPENFREEMAP_ATTRIBUTION, NATURAL_EARTH_ATTRIBUTION]
    : [OPENFREEMAP_ATTRIBUTION];
  return style.base === 'terrain' ? [...credits, TERRAIN_ATTRIBUTION] : credits;
}

/**
 * The credits of a stage's map as it is drawn: its style, plus what the stage adds. A dive-in
 * that ends on satellite shows MapTiler's pictures (when the server has a key), 3D terrain the
 * terrain tiles. An overlay shows no map; the terrain still shapes its lines (ADR 0013).
 */
export function mapCreditsOf(
  style: MapStyleRef,
  options: MapOptions,
  theme: Theme,
  satelliteAvailable: boolean,
): string[] {
  const terrain = options.terrain ? [TERRAIN_ATTRIBUTION] : [];
  if (options.transparent) return terrain;
  const satellite = options.satelliteMix && satelliteAvailable ? [MAPTILER_ATTRIBUTION] : [];
  return [...new Set([...styleCredits(style, theme), ...satellite, ...terrain])];
}

export interface VideoCreditsOptions {
  /** Own themes by ID; built-in ones need not be listed. */
  themes?: Readonly<Record<string, Theme>> | undefined;
  /** This render's overrides of the project's output settings. */
  output?: Partial<OutputSettings> | undefined;
  /** Whether the server has a satellite key (a dive-in may fade to satellite). */
  satelliteAvailable: boolean;
}

/**
 * Every credit a video of these stages carries, each once: maps and routers. One line of it
 * goes into the video's description ("Credits kopieren", `<video>.credits.txt`).
 */
export function videoCredits(
  project: Project,
  etappeIds: readonly Id[],
  { themes, output, satelliteAvailable }: VideoCreditsOptions,
): string[] {
  const resolved = resolveOutput(project, output);
  const credits = etappeIds.flatMap((id) => {
    const found = findEtappe(project, id);
    if (!found) return [];
    const style = resolveMapStyle(project, id).value;
    const { theme } = resolveTheme(style.themeId, themes);
    return [
      ...mapCreditsOf(style, mapOptionsOf(found.etappe, resolved), theme, satelliteAvailable),
      ...routingCredits(found.etappe.tracks.map((track) => track.computed?.provider)),
    ];
  });
  return [...new Set(credits)];
}
