import { PLANE_TYPES } from '@travel-route-animator/core';
import type { FC } from 'react';
import { buildPlane } from '../vehicles/planeModel';
import { MODEL_GRID_SIZE, ModelGrid, type ModelGridProps } from './ModelGrid';

// All aircraft types side by side, seen from the front left: for checking their proportions
// in Remotion Studio (pnpm studio) after changing planeShapes.ts. Not part of any video.

export const PLANE_TYPES_COMPOSITION_ID = 'PlaneTypes';
export const PLANE_TYPES_SIZE = MODEL_GRID_SIZE;

const ITEMS: ModelGridProps['items'] = PLANE_TYPES.map((type) => ({
  label: type,
  build: () => buildPlane(type, '#F2A541'),
}));

// Looking from the front left and above at the nose (+Y).
const EYE: ModelGridProps['eye'] = [-1.35, 1.25, 0.95];
const LOOK_AT: ModelGridProps['lookAt'] = [0, -0.05, 0];

export const PlaneTypesComposition: FC = () => (
  <ModelGrid items={ITEMS} columns={4} rows={3} eye={EYE} lookAt={LOOK_AT} />
);
