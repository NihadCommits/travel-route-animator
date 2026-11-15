import { PLANE_TYPES } from '@travel-route-animator/core';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildPlane } from './planeModel';
import { PLANE_SHAPES } from './planeShapes';

// The 3D planes are built from published dimensions, not from model files (ADR 0007). These
// checks keep them true to those numbers: an A380 must not come out with a 737's wings.

describe('buildPlane', () => {
  it.each(PLANE_TYPES)('builds %s to its real proportions, nose ahead and fin up', (type) => {
    const shape = PLANE_SHAPES[type];
    const size = new THREE.Box3()
      .setFromObject(buildPlane(type, '#e4572e'))
      .getSize(new THREE.Vector3());

    // One unit long (the layer scales it in metres), as wide as the wingspan in that unit.
    expect(size.y).toBeCloseTo(1, 1);
    expect(size.x / size.y).toBeCloseTo(shape.spanM / shape.lengthM, 1);
    // Taller than the body alone: the fin stands up along +Z.
    expect(size.z).toBeGreaterThan(shape.bodyWidthM / shape.lengthM);
  });

  it('paints engines and fin in the track colour, the body white', () => {
    const colours = new Set<string>();
    buildPlane('plane-a320', '#e4572e').traverse((object) => {
      if (object instanceof THREE.Mesh) {
        colours.add((object.material as THREE.MeshLambertMaterial).color.getHexString());
      }
    });
    expect(colours).toContain('e4572e');
    expect(colours).toContain('f8fafc');
  });

  it('is never culled by three.js, whose frustum knows nothing of the map projection', () => {
    const culled: string[] = [];
    buildPlane('plane-b737', '#000000').traverse((object) => {
      if (object.frustumCulled) culled.push(object.type);
    });
    expect(culled).toEqual([]);
  });
});
