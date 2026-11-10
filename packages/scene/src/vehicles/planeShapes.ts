import type { PlaneType } from '@travel-route-animator/core';

// The aircraft types as numbers, from the real aircraft's published dimensions (rounded). The
// 3D models are built from these (planeModel.ts); nothing is copied from model files, so there
// is no licence to follow. Kept free of three.js: the frame data needs the lengths too.

export interface PlaneShape {
  lengthM: number;
  spanM: number;
  bodyWidthM: number;
  /** Taller than wide: the A380's two full decks. */
  bodyHeightM?: number;
  /** The wing root's leading edge, as a share of the length behind the nose. */
  wingAt: number;
  rootChordM: number;
  tipChordM: number;
  sweepDeg: number;
  highWing?: boolean;
  /** Engines per side, as shares of the half span out from the middle. */
  engines: readonly number[];
  engineDiameterM: number;
  /** Turboprops: the propeller's diameter. */
  propellerM?: number;
  /** The 747's upper deck, as shares of the length behind the nose. */
  hump?: { from: number; to: number };
  /** Fin height above the top of the fuselage, and its chord at the root. */
  finHeightM: number;
  finChordM: number;
  stabiliserSpanM: number;
  /** Stabiliser on top of the fin. */
  tTail?: boolean;
  winglets?: boolean;
}

const A320: PlaneShape = {
  lengthM: 37.6,
  spanM: 35.8,
  bodyWidthM: 3.95,
  wingAt: 0.36,
  rootChordM: 6.5,
  tipChordM: 1.5,
  sweepDeg: 25,
  engines: [0.32],
  engineDiameterM: 2.2,
  finHeightM: 5.8,
  finChordM: 6,
  stabiliserSpanM: 12.5,
  winglets: true,
};

export const PLANE_SHAPES: Record<PlaneType, PlaneShape> = {
  // A friendly generic jet: an A320 with a rounder body and larger engines, like the flat icon.
  'plane-default': {
    ...A320,
    bodyWidthM: 4.9,
    rootChordM: 7,
    tipChordM: 1.6,
    sweepDeg: 26,
    engineDiameterM: 2.5,
    finHeightM: 6.2,
    finChordM: 6.5,
    stabiliserSpanM: 13,
    winglets: false,
  },
  'plane-a320': A320,
  'plane-b737': {
    lengthM: 39.5,
    spanM: 35.8,
    bodyWidthM: 3.76,
    wingAt: 0.37,
    rootChordM: 7,
    tipChordM: 1.3,
    sweepDeg: 25,
    engines: [0.28],
    engineDiameterM: 2.1,
    finHeightM: 6.5,
    finChordM: 6.5,
    stabiliserSpanM: 14.4,
    winglets: true,
  },
  'plane-e190': {
    lengthM: 36.2,
    spanM: 28.7,
    bodyWidthM: 3.0,
    wingAt: 0.4,
    rootChordM: 5.2,
    tipChordM: 1.2,
    sweepDeg: 23.5,
    engines: [0.33],
    engineDiameterM: 1.7,
    finHeightM: 5.3,
    finChordM: 5,
    stabiliserSpanM: 11,
    winglets: true,
  },
  'plane-atr72': {
    lengthM: 27.2,
    spanM: 27.1,
    bodyWidthM: 2.57,
    wingAt: 0.4,
    rootChordM: 2.6,
    tipChordM: 1.4,
    sweepDeg: 3,
    highWing: true,
    engines: [0.3],
    engineDiameterM: 1.1,
    propellerM: 3.9,
    finHeightM: 4.6,
    finChordM: 4.5,
    stabiliserSpanM: 7.3,
    tTail: true,
  },
  'plane-b787': {
    lengthM: 62.8,
    spanM: 60.1,
    bodyWidthM: 5.77,
    wingAt: 0.36,
    rootChordM: 11.5,
    tipChordM: 2.4,
    sweepDeg: 32,
    engines: [0.33],
    engineDiameterM: 3.4,
    finHeightM: 8.5,
    finChordM: 10,
    stabiliserSpanM: 20,
  },
  'plane-a350': {
    lengthM: 66.8,
    spanM: 64.8,
    bodyWidthM: 5.96,
    wingAt: 0.36,
    rootChordM: 11.8,
    tipChordM: 2.6,
    sweepDeg: 32,
    engines: [0.32],
    engineDiameterM: 3.6,
    finHeightM: 9,
    finChordM: 10.5,
    stabiliserSpanM: 19.5,
    winglets: true,
  },
  'plane-b777': {
    lengthM: 73.9,
    spanM: 64.8,
    bodyWidthM: 6.19,
    wingAt: 0.38,
    rootChordM: 12.5,
    tipChordM: 2.6,
    sweepDeg: 31.6,
    engines: [0.31],
    engineDiameterM: 4,
    finHeightM: 10,
    finChordM: 11,
    stabiliserSpanM: 21.5,
  },
  'plane-b747': {
    lengthM: 70.7,
    spanM: 64.4,
    bodyWidthM: 6.5,
    wingAt: 0.36,
    rootChordM: 13.5,
    tipChordM: 3,
    sweepDeg: 37.5,
    engines: [0.37, 0.65],
    engineDiameterM: 2.7,
    hump: { from: 0.04, to: 0.33 },
    finHeightM: 11,
    finChordM: 12,
    stabiliserSpanM: 22.2,
    winglets: true,
  },
  'plane-a380': {
    lengthM: 72.7,
    spanM: 79.8,
    bodyWidthM: 7.14,
    bodyHeightM: 8.41,
    wingAt: 0.33,
    rootChordM: 17.7,
    tipChordM: 4,
    sweepDeg: 33.5,
    engines: [0.33, 0.63],
    engineDiameterM: 3,
    finHeightM: 11.5,
    finChordM: 13,
    stabiliserSpanM: 30.4,
  },
};

/** The length everything is sized against: a typical short-haul jet. */
const REFERENCE_LENGTH_M = 38;

/**
 * How much larger a type is drawn than a short-haul jet. Damped: an A380 is twice as long as
 * an A320, but drawn twice as large it would dwarf the route; the ATR would shrink to a dot.
 */
export function planeSizeFactor(type: PlaneType): number {
  return (PLANE_SHAPES[type].lengthM / REFERENCE_LENGTH_M) ** 0.4;
}
