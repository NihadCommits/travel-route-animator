import type { CarType } from '@travel-route-animator/core';

// The body types as numbers: typical dimensions of each class (rounded), no particular make.
// carModel.ts builds the 3D cars from these; like the aircraft, nothing comes from model files.
// Kept free of three.js: the frame data needs the lengths too.
//
// Profiles are side views in metres: x from the rear bumper forwards, z up from the road.

export type Profile = readonly (readonly [x: number, z: number])[];

export interface CarShape {
  lengthM: number;
  widthM: number;
  /** Centre of the rear and the front axle, from the rear bumper. */
  axlesM: readonly [rear: number, front: number];
  wheelM: number;
  /** Everything up to the window line, in the car's colour. */
  body: Profile;
  /** The windows, set on top of the body and a little narrower. */
  glass: Profile;
  /** The glass's width at the top, as a share of its width at the bottom (tumblehome). */
  glassTaper: number;
  /** A panel in the car's colour covering the roof, so it reads as a car from above. */
  roof: { fromM: number; toM: number; topM: number };
  /** Skylights on a camper's roof. */
  skylights?: readonly number[];
}

export const CAR_SHAPES: Record<CarType, CarShape> = {
  // A mid-size saloon: long bonnet, a separate boot.
  'car-default': {
    lengthM: 4.75,
    widthM: 1.83,
    axlesM: [0.95, 3.8],
    wheelM: 0.66,
    body: [
      [0.1, 0.28],
      [4.6, 0.28],
      [4.75, 0.45],
      [4.75, 0.66],
      [3.5, 0.9],
      [0.25, 0.97],
      [0, 0.86],
      [0, 0.4],
    ],
    glass: [
      [0.4, 0.88],
      [3.55, 0.84],
      [2.55, 1.42],
      [1.15, 1.43],
    ],
    glassTaper: 0.8,
    roof: { fromM: 1.2, toM: 2.5, topM: 1.45 },
  },
  // A small hatchback: short bonnet, the roof runs almost to the end.
  'car-compact': {
    lengthM: 4.05,
    widthM: 1.75,
    axlesM: [0.65, 3.2],
    wheelM: 0.62,
    body: [
      [0.1, 0.28],
      [3.9, 0.28],
      [4.05, 0.45],
      [4.05, 0.68],
      [3.15, 0.92],
      [0.05, 0.98],
      [0, 0.86],
      [0, 0.4],
    ],
    glass: [
      [0.08, 0.9],
      [3.2, 0.86],
      [2.2, 1.45],
      [0.4, 1.46],
      [0.1, 1.02],
    ],
    glassTaper: 0.8,
    roof: { fromM: 0.45, toM: 2.15, topM: 1.47 },
  },
  // An estate: a saloon whose roof goes on to an upright tailgate.
  'car-estate': {
    lengthM: 4.85,
    widthM: 1.83,
    axlesM: [1.0, 3.85],
    wheelM: 0.66,
    body: [
      [0.1, 0.28],
      [4.7, 0.28],
      [4.85, 0.45],
      [4.85, 0.66],
      [3.6, 0.9],
      [0.05, 0.98],
      [0, 0.86],
      [0, 0.4],
    ],
    glass: [
      [0.08, 0.9],
      [3.65, 0.84],
      [2.65, 1.47],
      [0.25, 1.47],
      [0.06, 1.08],
    ],
    glassTaper: 0.82,
    roof: { fromM: 0.3, toM: 2.6, topM: 1.5 },
  },
  // An SUV: high, upright, bigger wheels and more ground clearance.
  'car-suv': {
    lengthM: 4.65,
    widthM: 1.88,
    axlesM: [0.95, 3.7],
    wheelM: 0.74,
    body: [
      [0.1, 0.4],
      [4.52, 0.4],
      [4.65, 0.58],
      [4.65, 0.88],
      [3.55, 1.06],
      [0.04, 1.1],
      [0, 1.0],
      [0, 0.52],
    ],
    glass: [
      [0.07, 1.02],
      [3.6, 1.0],
      [2.75, 1.65],
      [0.3, 1.66],
      [0.07, 1.18],
    ],
    glassTaper: 0.84,
    roof: { fromM: 0.35, toM: 2.7, topM: 1.68 },
  },
  // A van with windows all round: a tall box with a short nose.
  'car-van': {
    lengthM: 5.3,
    widthM: 2.0,
    axlesM: [0.9, 4.3],
    wheelM: 0.7,
    body: [
      [0.1, 0.38],
      [5.15, 0.38],
      [5.3, 0.56],
      [5.3, 0.98],
      [4.9, 1.14],
      [0, 1.14],
      [0, 0.5],
    ],
    glass: [
      [0, 1.06],
      [4.92, 1.06],
      [4.1, 1.96],
      [0, 1.97],
    ],
    glassTaper: 0.96,
    roof: { fromM: 0.02, toM: 4.05, topM: 1.99 },
  },
  // A semi-integrated motorhome on a van chassis: low cab, tall living box.
  'car-camper': {
    lengthM: 6.99,
    widthM: 2.32,
    axlesM: [1.45, 5.48],
    wheelM: 0.72,
    // The living box reaches forward over the cab in a sloping cap.
    body: [
      [0.15, 0.42],
      [6.85, 0.42],
      [6.99, 0.6],
      [6.99, 1.0],
      [6.55, 1.18],
      [5.05, 1.2],
      [5.05, 2.0],
      [5.9, 2.05],
      [5.15, 2.95],
      [0.1, 2.95],
      [0, 2.85],
      [0, 0.55],
    ],
    glass: [
      [5.0, 1.12],
      [6.57, 1.12],
      [5.9, 2.06],
      [5.0, 2.06],
    ],
    glassTaper: 0.92,
    roof: { fromM: 0.12, toM: 5.1, topM: 2.95 },
    skylights: [1.2, 2.6, 3.9],
  },
};

/** The length everything is sized against: the saloon. */
const REFERENCE_LENGTH_M = 4.75;

/**
 * How much larger a body type is drawn than the saloon. Damped like the aircraft's, so a
 * camper is clearly bigger without dwarfing the route.
 */
export function carSizeFactor(type: CarType): number {
  return (CAR_SHAPES[type].lengthM / REFERENCE_LENGTH_M) ** 0.4;
}
