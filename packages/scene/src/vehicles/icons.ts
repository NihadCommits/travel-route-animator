import type { VehicleType } from '@travel-route-animator/core';

// Vehicle icons as small SVGs, drawn for this project. Vehicles are silhouettes seen from above
// with the nose pointing up (north); the map turns them with the heading. People on foot are a
// plain disc, as usual in route animations: a walker turned on its side looks odd.

/** Drawn on a 64 × 64 grid; the map shows them at ICON_SIZE_PX (reference pixels). */
const GRID = 64;
export const ICON_SIZE_PX = 64;

/** Whether the icon turns with the heading. */
export const ROTATES: Record<VehicleType, boolean> = {
  car: true,
  motorbike: true,
  bus: true,
  train: true,
  bike: true,
  ferry: true,
  plane: true,
  walk: false,
  hike: false,
};

const OUTLINE = 'stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round"';
const GLASS = 'fill="#ffffff" fill-opacity="0.72"';
const SHADE = 'fill="#000000" fill-opacity="0.16"';
const TYRE = '#1f2937';

// Each shape takes the track colour; details are white glass or a darker shade on top.
const SHAPES: Record<VehicleType, (color: string) => string> = {
  car: (c) => `
    <rect x="19" y="5" width="26" height="54" rx="10" fill="${c}" ${OUTLINE}/>
    <path d="M23.5 21 Q32 15.5 40.5 21 L38.5 28.5 Q32 25.5 25.5 28.5 Z" ${GLASS}/>
    <rect x="25" y="30" width="14" height="14" rx="3" ${SHADE}/>
    <path d="M25 46.5 Q32 49.5 39 46.5 L39.5 52 Q32 55 24.5 52 Z" ${GLASS}/>`,
  bus: (c) => `
    <rect x="19" y="3" width="26" height="58" rx="5" fill="${c}" ${OUTLINE}/>
    <rect x="22.5" y="6.5" width="19" height="7" rx="2" ${GLASS}/>
    <rect x="25" y="19" width="14" height="9" rx="2" ${SHADE}/>
    <rect x="25" y="34" width="14" height="9" rx="2" ${SHADE}/>
    <rect x="22.5" y="52" width="19" height="5" rx="1.5" ${GLASS}/>`,
  // Two-wheelers: wheels, handlebar, and the rider seen from above (shoulders, arms, head).
  motorbike: (c) => `
    <rect x="28.5" y="1.5" width="7" height="16" rx="3.5" fill="${TYRE}" ${OUTLINE}/>
    <rect x="28.5" y="46.5" width="7" height="16" rx="3.5" fill="${TYRE}" ${OUTLINE}/>
    <rect x="25" y="12" width="14" height="40" rx="7" fill="${c}" ${OUTLINE}/>
    <path d="M20 17 L44 17" stroke="#ffffff" stroke-width="7" stroke-linecap="round"/>
    <path d="M21 17 L43 17" stroke="${TYRE}" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M23 31 L22 18 M41 31 L42 18" stroke="#ffffff" stroke-width="7" stroke-linecap="round"/>
    <path d="M23 31 L22 18 M41 31 L42 18" stroke="${c}" stroke-width="3.5" stroke-linecap="round"/>
    <ellipse cx="32" cy="35" rx="12" ry="7.5" fill="${c}" ${OUTLINE}/>
    <circle cx="32" cy="31" r="6" fill="#ffffff"/>
    <circle cx="32" cy="31" r="4" ${SHADE}/>`,
  bike: (c) => `
    <rect x="30" y="2" width="4" height="17" rx="2" fill="${TYRE}" ${OUTLINE}/>
    <rect x="30" y="44" width="4" height="18" rx="2" fill="${TYRE}" ${OUTLINE}/>
    <path d="M32 18 L32 46" stroke="#ffffff" stroke-width="6" stroke-linecap="round"/>
    <path d="M32 18 L32 46" stroke="${c}" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M22 17 L42 17" stroke="#ffffff" stroke-width="6.5" stroke-linecap="round"/>
    <path d="M23 17 L41 17" stroke="${TYRE}" stroke-width="3" stroke-linecap="round"/>
    <path d="M24 30 L23.5 18 M40 30 L40.5 18" stroke="#ffffff" stroke-width="6.5" stroke-linecap="round"/>
    <path d="M24 30 L23.5 18 M40 30 L40.5 18" stroke="${c}" stroke-width="3" stroke-linecap="round"/>
    <ellipse cx="32" cy="33" rx="11" ry="6.5" fill="${c}" ${OUTLINE}/>
    <circle cx="32" cy="30" r="4.5" fill="${TYRE}" stroke="#ffffff" stroke-width="2"/>`,
  train: (c) => `
    <path d="M21 14 Q21 2 32 2 Q43 2 43 14 L43 60 Q43 62 41 62 L23 62 Q21 62 21 60 Z" fill="${c}" ${OUTLINE}/>
    <path d="M24.5 10 Q32 4.5 39.5 10 L39 15 Q32 12 25 15 Z" ${GLASS}/>
    <rect x="25" y="20" width="14" height="40" rx="2" ${SHADE}/>
    <path d="M21 40 L43 40" stroke="#ffffff" stroke-width="2"/>`,
  ferry: (c) => `
    <path d="M32 2 C42 12 46 22 46 34 L46 57 Q46 61 42 61 L22 61 Q18 61 18 57 L18 34 C18 22 22 12 32 2 Z" fill="${c}" ${OUTLINE}/>
    <rect x="24" y="24" width="16" height="22" rx="3" ${SHADE}/>
    <rect x="26.5" y="27" width="11" height="6" rx="1.5" ${GLASS}/>
    <circle cx="32" cy="14" r="2.5" ${GLASS}/>`,
  plane: (c) => `
    <path d="M32 2 C34.5 2 35.5 5.5 35.5 10 L35.5 23 L59 35 L59 41 L35.5 34.5 L35.5 49 L43 55 L43 60 L32 57 L21 60 L21 55 L28.5 49 L28.5 34.5 L5 41 L5 35 L28.5 23 L28.5 10 C28.5 5.5 29.5 2 32 2 Z" fill="${c}" ${OUTLINE}/>
    <path d="M30 9 Q32 6 34 9 L34 13 L30 13 Z" ${GLASS}/>`,
  walk: (c) => `<circle cx="32" cy="32" r="12" fill="${c}" stroke="#ffffff" stroke-width="4.5"/>`,
  hike: (c) => `<circle cx="32" cy="32" r="12" fill="${c}" stroke="#ffffff" stroke-width="4.5"/>`,
};

/** The MapLibre image name for a vehicle in a colour. */
export function iconId(vehicle: VehicleType, color: string): string {
  return `vehicle:${vehicle}:${color.toLowerCase()}`;
}

/**
 * The icon as an SVG document, `pixels` wide. A soft shadow all around (no offset, so it does
 * not swing round when the icon turns) lifts it off the map.
 */
export function iconSvg(vehicle: VehicleType, color: string, pixels: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pixels}" height="${pixels}" viewBox="0 0 ${GRID} ${GRID}">
  <defs><filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="0" stdDeviation="1.4" flood-color="#000000" flood-opacity="0.45"/></filter></defs>
  <g filter="url(#s)">${SHAPES[vehicle](color)}</g>
</svg>`;
}
