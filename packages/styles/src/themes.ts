import type { LabelSettings, Theme } from '@travel-route-animator/core';

// The built-in themes as data (ADR 0010). Colours are chosen for video: calm surfaces, so the
// route and the vehicles stand out, and enough contrast for labels at 1080p.

const VIDEO_LABELS: LabelSettings = {
  countries: true,
  states: false,
  cities: true,
  towns: true,
  villages: true,
  roads: true,
  water: true,
  pois: false,
};

const ALL_LAYERS: Theme['layers'] = {
  minorRoads: true,
  buildings: true,
  boundaries: true,
  landcover: true,
  relief: false,
};

export const BUILT_IN_THEMES = [
  {
    id: 'clean-light',
    name: 'Clean Hell',
    tokens: {
      background: '#dfe7ee',
      land: '#f4f1ea',
      landcover: '#dde8cf',
      park: '#cfe3bd',
      ice: '#ffffff',
      urban: '#ece6db',
      water: '#a9d3ee',
      waterText: '#4a7fa7',
      roadMotorway: '#f6c76c',
      roadMajor: '#ffffff',
      roadMinor: '#ffffff',
      roadCasing: '#d6cdbe',
      rail: '#b3aca0',
      building: '#e2dbcf',
      boundary: '#a397b5',
      labelText: '#3a3f47',
      labelHalo: '#ffffff',
    },
    layers: ALL_LAYERS,
    labels: VIDEO_LABELS,
    extras: { texture: 'none', vignette: 0 },
  },
  {
    id: 'night',
    name: 'Nacht',
    tokens: {
      background: '#0d1320',
      land: '#1b2433',
      landcover: '#1e2b36',
      park: '#1f3030',
      ice: '#2a3446',
      urban: '#222c3c',
      water: '#0e1828',
      waterText: '#6f8db5',
      roadMotorway: '#e0a458',
      roadMajor: '#45536b',
      roadMinor: '#334056',
      roadCasing: '#141b28',
      rail: '#4a5568',
      building: '#263142',
      boundary: '#7a6aa0',
      labelText: '#d7e0ee',
      labelHalo: '#0d1320',
    },
    layers: ALL_LAYERS,
    labels: VIDEO_LABELS,
    extras: { texture: 'none', vignette: 0.35 },
  },
  {
    // Like the maps of open-world games: grey, desaturated ground and bold main roads. Only
    // the mood; no names, logos or colours of a particular game.
    id: 'open-world',
    name: 'Open World',
    tokens: {
      background: '#1f2327',
      land: '#3a3f45',
      landcover: '#3f4840',
      park: '#45524a',
      ice: '#5b6168',
      urban: '#41464d',
      water: '#2c4a63',
      waterText: '#8fb3d1',
      roadMotorway: '#f2c14e',
      roadMajor: '#e9edf1',
      roadMinor: '#8c939b',
      roadCasing: '#2a2e33',
      rail: '#6b727a',
      building: '#4b5158',
      boundary: '#9aa3ad',
      labelText: '#f2f4f7',
      labelHalo: '#1f2327',
    },
    layers: ALL_LAYERS,
    labels: { ...VIDEO_LABELS, villages: false },
    extras: { texture: 'none', vignette: 0.25 },
  },
  {
    id: 'rustic',
    name: 'Rustikal',
    tokens: {
      background: '#d9c7a3',
      land: '#efe3c8',
      landcover: '#dcd4a8',
      park: '#d1d4a2',
      ice: '#f6f0e2',
      urban: '#e6d5b5',
      water: '#b7cdc6',
      waterText: '#5f7f78',
      roadMotorway: '#c1714a',
      roadMajor: '#b39367',
      roadMinor: '#cdb991',
      roadCasing: '#e9dcc0',
      rail: '#8c7a5c',
      building: '#d8c49e',
      boundary: '#8a5a44',
      labelText: '#4a3826',
      labelHalo: '#f3e9d2',
    },
    layers: { ...ALL_LAYERS, relief: true },
    labels: VIDEO_LABELS,
    extras: { texture: 'paper', vignette: 0.3 },
  },
  {
    id: 'old-globe',
    name: 'Alter Globus',
    tokens: {
      background: '#c9b483',
      land: '#e8d6aa',
      landcover: '#d9c993',
      park: '#d3c58c',
      ice: '#f3ead2',
      urban: '#dfc999',
      water: '#a3b8aa',
      waterText: '#4f6b62',
      roadMotorway: '#9c5b3b',
      roadMajor: '#a47c4f',
      roadMinor: '#c3a675',
      roadCasing: '#e8d6aa',
      rail: '#8a6f4c',
      building: '#d4bd8a',
      boundary: '#8b4a3c',
      labelText: '#3e2e1c',
      labelHalo: '#efe2bf',
    },
    layers: { ...ALL_LAYERS, minorRoads: false, buildings: false, relief: true },
    labels: { ...VIDEO_LABELS, villages: false, roads: false },
    extras: { texture: 'paper', vignette: 0.5 },
  },
] as const satisfies readonly Theme[];

export type BuiltInThemeId = (typeof BUILT_IN_THEMES)[number]['id'];

/** The theme a vector map gets when its style names none, or one that no longer exists. */
export const DEFAULT_THEME_ID: BuiltInThemeId = 'clean-light';

export function builtInTheme(id: string | undefined): Theme | undefined {
  return BUILT_IN_THEMES.find((theme) => theme.id === id);
}

export function isBuiltInTheme(id: string): boolean {
  return builtInTheme(id) !== undefined;
}

/**
 * The theme a style asks for: a built-in one, an own one among `custom`, or the default when
 * it is missing (deleted, or made on another computer).
 */
export function resolveTheme(
  themeId: string | undefined,
  custom: Readonly<Record<string, Theme>> = {},
): { theme: Theme; missing: boolean } {
  const id = themeId ?? DEFAULT_THEME_ID;
  const found = builtInTheme(id) ?? custom[id];
  return found
    ? { theme: found, missing: false }
    : { theme: builtInTheme(DEFAULT_THEME_ID)!, missing: true };
}
