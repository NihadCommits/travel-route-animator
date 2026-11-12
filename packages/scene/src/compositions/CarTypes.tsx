import { CAR_TYPES } from '@travel-route-animator/core';
import type { FC } from 'react';
import { buildCar } from '../vehicles/carModel';
import { MODEL_GRID_SIZE, ModelGrid, type ModelGridProps } from './ModelGrid';

// All body types side by side, seen from the front left and above like on a tilted map: for
// checking them in Remotion Studio (pnpm studio) after changing carShapes.ts.

export const CAR_TYPES_COMPOSITION_ID = 'CarTypes';
export const CAR_TYPES_SIZE = MODEL_GRID_SIZE;

const ITEMS: ModelGridProps['items'] = CAR_TYPES.map((type) => ({
  label: type,
  build: () => buildCar(type, '#3B82F6'),
}));

const EYE: ModelGridProps['eye'] = [-1.2, 1.3, 1.1];
const LOOK_AT: ModelGridProps['lookAt'] = [0, 0, 0.12];

export const CarTypesComposition: FC = () => (
  <ModelGrid items={ITEMS} columns={3} rows={2} eye={EYE} lookAt={LOOK_AT} />
);
