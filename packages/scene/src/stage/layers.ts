import type { Timeline } from '@travel-route-animator/core';
import type { GeoJSONSource, LineLayerSpecification, Map as MapLibreMap } from 'maplibre-gl';
import { ICON_SIZE_PX, iconId, iconSvg, PLANE_SHADOW_ICON } from '../vehicles/icons';
import {
  framedPhoto,
  IMAGE_PIXEL_RATIO,
  imageFrameId,
  imageShadowId,
  pinPhotoId,
  silhouette,
  type DecodedImage,
} from '../vehicles/images';
import type { SceneFeatures } from './features';

const SOURCES = {
  shadows: 'tra-shadows',
  shadowIcons: 'tra-shadow-icons',
  ahead: 'tra-ahead',
  routes: 'tra-routes',
  vehicles: 'tra-vehicles',
  stops: 'tra-stops',
  pins: 'tra-pins',
} as const satisfies Record<keyof SceneFeatures, string>;

/**
 * A photo pin is this many times the 64 px of a vehicle icon on its longer side: about a
 * fifth of the picture's height in 1080p.
 */
const PIN_PHOTO_SIZE = 3.4;

const EMPTY = { type: 'FeatureCollection' as const, features: [] };

const SHADOW_COLOR = '#0f172a';

// Dash lengths are in multiples of the line width; "dotted" is short dashes with round caps.
const DASHES = { solid: undefined, dashed: [2, 1.6], dotted: [0.01, 2] } as const;

/** Label font of the base style (OpenFreeMap serves it); own fonts come with the themes (M9). */
const LABEL_FONT = ['Noto Sans Bold'];

type Paint = NonNullable<LineLayerSpecification['paint']>;

function lineLayers(prefix: string, source: string, paint: Paint): LineLayerSpecification[] {
  // line-dasharray cannot depend on feature data, hence one layer per kind of line.
  return (Object.keys(DASHES) as (keyof typeof DASHES)[]).map((dash) => ({
    id: `${prefix}-${dash}`,
    type: 'line',
    source,
    filter: ['==', ['get', 'dash'], dash],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { ...paint, ...(DASHES[dash] && { 'line-dasharray': [...DASHES[dash]] }) },
  }));
}

/** Our sources and layers on top of the base map, bottom to top. Call once the style is loaded. */
export function addSceneLayers(map: MapLibreMap): void {
  for (const source of Object.values(SOURCES)) {
    map.addSource(source, { type: 'geojson', data: EMPTY });
  }

  // Flights: their shadow lies on the ground, under everything else of ours (ADR 0007).
  map.addLayer({
    id: 'tra-shadow-line',
    type: 'line',
    source: SOURCES.shadows,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': SHADOW_COLOR,
      'line-width': 3,
      'line-opacity': 0.28,
      'line-blur': 1.5,
    },
  });
  map.addLayer({
    id: 'tra-shadow-icon',
    type: 'symbol',
    source: SOURCES.shadowIcons,
    layout: {
      'icon-image': ['get', 'icon'],
      'icon-size': ['get', 'size'],
      'icon-rotate': ['get', 'bearing'],
      'icon-rotation-alignment': 'map',
      'icon-pitch-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: { 'icon-opacity': 0.3 },
  });

  // The route still ahead, in its own dash and opacity (ADR 0008).
  for (const layer of lineLayers('tra-ahead', SOURCES.ahead, {
    'line-color': ['get', 'color'],
    'line-width': ['get', 'width'],
    'line-opacity': ['get', 'opacity'],
  })) {
    map.addLayer(layer);
  }

  // Glow: a wide, blurred copy under the line, only for tracks that ask for it.
  map.addLayer({
    id: 'tra-route-glow',
    type: 'line',
    source: SOURCES.routes,
    filter: ['==', ['get', 'glow'], true],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['*', ['get', 'width'], 3],
      'line-blur': ['*', ['get', 'width'], 1.5],
      'line-opacity': 0.55,
    },
  });
  // A white casing keeps a solid line readable on any map colour.
  map.addLayer({
    id: 'tra-route-casing',
    type: 'line',
    source: SOURCES.routes,
    filter: ['==', ['get', 'dash'], 'solid'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': ['+', ['get', 'width'], 4] },
  });
  for (const layer of lineLayers('tra-route', SOURCES.routes, {
    'line-color': ['get', 'color'],
    'line-width': ['get', 'width'],
  })) {
    map.addLayer(layer);
  }

  // Stops: a dot on the line and the name above it, both fading in together.
  map.addLayer({
    id: 'tra-stop-dots',
    type: 'circle',
    source: SOURCES.stops,
    paint: {
      'circle-radius': 6,
      'circle-color': '#ffffff',
      'circle-stroke-color': ['get', 'color'],
      'circle-stroke-width': 3,
      'circle-opacity': ['get', 'opacity'],
      'circle-stroke-opacity': ['get', 'opacity'],
      'circle-pitch-alignment': 'map',
    },
  });
  map.addLayer({
    id: 'tra-stop-labels',
    type: 'symbol',
    source: SOURCES.stops,
    layout: {
      'text-field': ['get', 'text'],
      'text-font': LABEL_FONT,
      'text-size': 26,
      'text-anchor': 'bottom',
      // Above the dot and clear of a vehicle standing on it.
      'text-offset': [0, -1.3],
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'text-color': '#1f2937',
      'text-halo-color': '#ffffff',
      'text-halo-width': 2.5,
      'text-opacity': ['get', 'opacity'],
    },
  });

  // Vehicles on top. Rotation against the map, so a turned map turns the car with it.
  map.addLayer({
    id: 'tra-vehicles',
    type: 'symbol',
    source: SOURCES.vehicles,
    filter: ['!', ['get', 'upright']],
    layout: {
      'icon-image': ['get', 'icon'],
      'icon-size': ['get', 'size'],
      'icon-rotate': ['get', 'bearing'],
      'icon-rotation-alignment': 'map',
      'icon-pitch-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  });
  // Own images that do not turn stand on their point and face the viewer, like a cut-out
  // figure; pitch alignment is a layout property, so they need a layer of their own.
  map.addLayer({
    id: 'tra-vehicles-upright',
    type: 'symbol',
    source: SOURCES.vehicles,
    filter: ['get', 'upright'],
    layout: {
      'icon-image': ['get', 'icon'],
      'icon-size': ['get', 'size'],
      'icon-anchor': 'bottom',
      'icon-rotation-alignment': 'viewport',
      'icon-pitch-alignment': 'viewport',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  });

  // Pins pop up above everything (ADR 0014): a dot where the place is, the framed photo or
  // the name standing over it and facing the viewer, all scaled by how far they have popped.
  map.addLayer({
    id: 'tra-pin-dots',
    type: 'circle',
    source: SOURCES.pins,
    paint: {
      'circle-radius': ['*', 7, ['get', 'scale']],
      'circle-color': '#ffffff',
      'circle-stroke-color': '#1f2937',
      'circle-stroke-width': 3,
      'circle-opacity': ['get', 'opacity'],
      'circle-stroke-opacity': ['get', 'opacity'],
      'circle-pitch-alignment': 'map',
    },
  });
  map.addLayer({
    id: 'tra-pin-photos',
    type: 'symbol',
    source: SOURCES.pins,
    filter: ['==', ['get', 'kind'], 'photo'],
    layout: {
      'icon-image': ['get', 'icon'],
      'icon-size': ['*', PIN_PHOTO_SIZE, ['get', 'scale']],
      'icon-anchor': 'bottom',
      'icon-offset': [0, -6],
      'icon-pitch-alignment': 'viewport',
      'icon-rotation-alignment': 'viewport',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'text-field': ['get', 'title'],
      'text-font': LABEL_FONT,
      'text-size': ['*', 22, ['max', ['get', 'scale'], 0.01]],
      'text-anchor': 'top',
      'text-offset': [0, 0.8],
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'icon-opacity': ['get', 'opacity'],
      'text-color': '#1f2937',
      'text-halo-color': '#ffffff',
      'text-halo-width': 2.5,
      'text-opacity': ['get', 'opacity'],
    },
  });
  map.addLayer({
    id: 'tra-pin-places',
    type: 'symbol',
    source: SOURCES.pins,
    filter: ['==', ['get', 'kind'], 'place'],
    layout: {
      'text-field': ['get', 'title'],
      'text-font': LABEL_FONT,
      'text-size': ['*', 34, ['max', ['get', 'scale'], 0.01]],
      'text-anchor': 'bottom',
      'text-offset': [0, -0.6],
      'text-pitch-alignment': 'viewport',
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'text-color': '#111827',
      'text-halo-color': '#ffffff',
      'text-halo-width': 3,
      'text-opacity': ['get', 'opacity'],
    },
  });
}

export function setSceneFeatures(map: MapLibreMap, features: SceneFeatures): Promise<unknown> {
  return Promise.all(
    (Object.keys(SOURCES) as (keyof SceneFeatures)[]).map(
      (key) =>
        // Sources exist from addSceneLayers on; a missing one would be a bug, not a slow load.
        map.getSource<GeoJSONSource>(SOURCES[key])?.setData(features[key]) ?? Promise.resolve(),
    ),
  );
}

/**
 * Turns the SVG icons of every vehicle in the stage into map images. Drawn at twice the size
 * and handed over with pixelRatio 2, so they stay sharp in a 4K export.
 */
export async function loadVehicleIcons(map: MapLibreMap, timeline: Timeline): Promise<void> {
  const wanted = new Map(
    timeline.tracks.map(
      (plan) =>
        [
          iconId(plan.vehicle, plan.style.lineColor),
          iconSvg(plan.vehicle, plan.style.lineColor, ICON_SIZE_PX * 2),
        ] as const,
    ),
  );
  if (timeline.tracks.some((plan) => plan.flight)) {
    // All of the shape dark, the white outline and glass included.
    const shadow = iconSvg('plane', SHADOW_COLOR, ICON_SIZE_PX * 2);
    wanted.set(PLANE_SHADOW_ICON, shadow.replaceAll('#ffffff', SHADOW_COLOR));
  }
  await Promise.all(
    [...wanted].map(async ([id, svg]) => {
      if (map.hasImage(id)) return;
      const image = new Image();
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await image.decode();
      if (!map.hasImage(id)) map.addImage(id, image, { pixelRatio: 2 });
    }),
  );
}

/**
 * Hands every picture of the stage's own images to the map, and a dark silhouette of the first
 * for a flight's shadow (ADR 0009). Images the map already has are skipped.
 */
export function addStageImages(map: MapLibreMap, images: ReadonlyMap<string, DecodedImage>) {
  for (const [assetId, { frames }] of images) {
    frames.forEach((frame, i) => {
      const id = imageFrameId(assetId, i);
      if (!map.hasImage(id)) map.addImage(id, frame, { pixelRatio: IMAGE_PIXEL_RATIO });
    });
    const shadow = imageShadowId(assetId);
    if (frames[0] && !map.hasImage(shadow)) {
      map.addImage(shadow, silhouette(frames[0], SHADOW_COLOR), { pixelRatio: IMAGE_PIXEL_RATIO });
    }
    const photo = pinPhotoId(assetId);
    if (frames[0] && !map.hasImage(photo)) {
      map.addImage(photo, framedPhoto(frames[0]), { pixelRatio: IMAGE_PIXEL_RATIO });
    }
  }
}
