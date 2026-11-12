import type { CarType } from '@travel-route-animator/core';
import * as THREE from 'three';
import { CAR_SHAPES, type CarShape, type Profile } from './carShapes';

// 3D cars built from their side profiles (carShapes.ts), plain like the planes: no model files,
// no licences. Axes are east-north-up as for the planes: the bonnet points along +Y, the width
// along X, the roof up along +Z, and the wheels stand on z = 0. The model is 1 long.

const SIDE = THREE.DoubleSide;
const TYRE = '#1f2937';
const HUB = '#94a3b8';

/** Swaps the axes of a profile drawn in the XY plane so it stands upright: x → Y, y → Z, z → X. */
const UPRIGHT = new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1);

/**
 * A side profile extruded across the width. The bevel rounds the edges where the sides meet
 * the top, nose and tail, so the car looks pressed rather than cut from a block; the negative
 * offset keeps the outline at the profile's own size.
 */
function extrude(profile: Profile, shape: CarShape, width: number, round: number) {
  const outline = new THREE.Shape(profile.map(([x, z]) => new THREE.Vector2(x, z)));
  const geometry = new THREE.ExtrudeGeometry(outline, {
    depth: width - 2 * round,
    bevelEnabled: true,
    bevelThickness: round,
    bevelSize: round,
    bevelOffset: -round,
    bevelSegments: 3,
    curveSegments: 4,
  });
  geometry.translate(-shape.lengthM / 2, 0, -(width - 2 * round) / 2);
  geometry.applyMatrix4(UPRIGHT);
  return geometry;
}

/** The windows: narrower towards the roof, as on a real car (tumblehome). */
function glass(shape: CarShape): THREE.BufferGeometry {
  const width = shape.widthM * 0.94;
  const geometry = extrude(shape.glass, shape, width, 0.05);
  const zs = shape.glass.map(([, z]) => z);
  const bottom = Math.min(...zs);
  const top = Math.max(...zs);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const f = (position.getZ(i) - bottom) / (top - bottom);
    position.setX(i, position.getX(i) * (1 - (1 - shape.glassTaper) * f));
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** A panel in the car's colour on top of the glass, at its narrowest width. */
function roof(shape: CarShape, material: THREE.Material): THREE.Mesh {
  const { fromM, toM, topM } = shape.roof;
  const width = shape.widthM * 0.94 * shape.glassTaper;
  const thickness = 0.06;
  const geometry = new THREE.BoxGeometry(width, toM - fromM, thickness);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, (fromM + toM) / 2 - shape.lengthM / 2, topM + thickness / 2 - 0.02);
  return mesh;
}

function wheels(shape: CarShape): THREE.Mesh[] {
  const radius = shape.wheelM / 2;
  const tread = 0.24;
  const tyre = new THREE.MeshLambertMaterial({ color: TYRE, side: SIDE });
  const hub = new THREE.MeshLambertMaterial({ color: HUB, side: SIDE });
  const meshes: THREE.Mesh[] = [];
  for (const axle of shape.axlesM) {
    for (const side of [-1, 1]) {
      const x = side * (shape.widthM / 2 - tread / 2 + 0.02);
      const y = axle - shape.lengthM / 2;
      // A cylinder stands along Y; turned a quarter round Z, its axis runs across the car.
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, tread, 20), tyre);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, y, radius);
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, 0.02, 16),
        hub,
      );
      cap.rotation.z = Math.PI / 2;
      cap.position.set(x + side * (tread / 2 + 0.005), y, radius);
      meshes.push(wheel, cap);
    }
  }
  return meshes;
}

/** Head and tail lights: they show at a glance which way the car is facing. */
function lights(shape: CarShape): THREE.Mesh[] {
  const front = shape.body.reduce((a, b) =>
    b[0] > a[0] || (b[0] === a[0] && b[1] > a[1]) ? b : a,
  );
  const rear = shape.body.reduce((a, b) => (b[0] < a[0] || (b[0] === a[0] && b[1] > a[1]) ? b : a));
  const head = new THREE.MeshBasicMaterial({ color: '#fef9c3', side: SIDE });
  const tail = new THREE.MeshBasicMaterial({ color: '#dc2626', side: SIDE });
  const size = new THREE.BoxGeometry(shape.widthM * 0.2, 0.06, 0.12);
  return [-1, 1].flatMap((side) => {
    const x = side * shape.widthM * 0.32;
    const headLight = new THREE.Mesh(size, head);
    headLight.position.set(x, shape.lengthM / 2 + 0.01, front[1] - 0.12);
    const tailLight = new THREE.Mesh(size, tail);
    tailLight.position.set(x, -shape.lengthM / 2 - 0.01, rear[1] - 0.14);
    return [headLight, tailLight];
  });
}

function skylights(shape: CarShape): THREE.Mesh[] {
  const material = new THREE.MeshLambertMaterial({ color: '#e2e8f0', side: SIDE });
  return (shape.skylights ?? []).map((at) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.12), material);
    mesh.position.set(0, at - shape.lengthM / 2, shape.roof.topM + 0.08);
    return mesh;
  });
}

/**
 * A soft shadow on the road, a little larger than the car: without it a car on a tilted map
 * seems to float. Drawn once into a small canvas and blurred there.
 */
function shadow(shape: CarShape): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const context = canvas.getContext('2d')!;
  context.filter = 'blur(7px)';
  context.fillStyle = '#000000';
  context.fillRect(14, 14, 36, 100);
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    side: SIDE,
  });
  // The blurred rectangle fills 36 / 64 of the canvas across and 100 / 128 along.
  const geometry = new THREE.PlaneGeometry(
    (shape.widthM * 1.08 * 64) / 36,
    (shape.lengthM * 1.04 * 128) / 100,
  );
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.z = 0.01;
  return mesh;
}

/** A car of the given body type in the track colour. */
export function buildCar(type: CarType, color: string): THREE.Group {
  const shape = CAR_SHAPES[type];
  // Two-sided: the Mercator placement mirrors the model (y grows southwards there).
  const paint = new THREE.MeshLambertMaterial({ color, side: SIDE });
  const windows = new THREE.MeshLambertMaterial({ color: '#334155', side: SIDE });

  const model = new THREE.Group();
  model.add(
    shadow(shape),
    new THREE.Mesh(extrude(shape.body, shape, shape.widthM, 0.12), paint),
    new THREE.Mesh(glass(shape), windows),
    roof(shape, paint),
    ...skylights(shape),
    ...wheels(shape),
    ...lights(shape),
  );
  model.scale.setScalar(1 / shape.lengthM);
  const group = new THREE.Group();
  group.add(model);
  // The layer's camera matrix holds the map projection; three's own culling would use the
  // wrong frustum for that.
  group.traverse((object) => (object.frustumCulled = false));
  return group;
}
