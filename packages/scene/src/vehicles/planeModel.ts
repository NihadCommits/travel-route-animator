import * as THREE from 'three';

// The default 3D plane: built from a few primitives, so it needs no model file and no licence,
// and looks as plain as the flat icons. Axes are east-north-up: the nose points along +Y, the
// wings along X, the fin up along +Z. Length is about 1, so the layer scales it in metres.

const SIDE = THREE.DoubleSide;

function flat(points: [number, number][], depth: number, material: THREE.Material): THREE.Mesh {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geometry.translate(0, 0, -depth / 2);
  return new THREE.Mesh(geometry, material);
}

/** A plane with white body, light grey wings, and fin and engines in the track colour. */
export function buildPlane(color: string): THREE.Group {
  // Two-sided: the Mercator placement mirrors the model (y grows southwards there).
  const white = new THREE.MeshLambertMaterial({ color: '#f8fafc', side: SIDE });
  const grey = new THREE.MeshLambertMaterial({ color: '#cbd5e1', side: SIDE });
  const accent = new THREE.MeshLambertMaterial({ color, side: SIDE });
  const group = new THREE.Group();

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.78, 20), white);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.065, 20, 12), white);
  nose.scale.set(1, 2.2, 1);
  nose.position.y = 0.39;
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.2, 20), white);
  tail.rotation.x = Math.PI;
  tail.position.y = -0.49;

  const wings = flat(
    [
      [0.06, 0.12],
      [0.5, -0.1],
      [0.5, -0.16],
      [0.06, -0.06],
      [-0.06, -0.06],
      [-0.5, -0.16],
      [-0.5, -0.1],
      [-0.06, 0.12],
    ],
    0.02,
    grey,
  );
  wings.position.z = -0.02;
  const stabiliser = flat(
    [
      [0.04, -0.32],
      [0.2, -0.44],
      [0.2, -0.48],
      [0.04, -0.43],
      [-0.04, -0.43],
      [-0.2, -0.48],
      [-0.2, -0.44],
      [-0.04, -0.32],
    ],
    0.015,
    grey,
  );
  stabiliser.position.z = 0.02;
  // The fin is drawn in the XY plane and then turned so x → body Y, y → body Z, z → body X.
  const fin = flat(
    [
      [-0.3, 0.04],
      [-0.47, 0.25],
      [-0.53, 0.25],
      [-0.52, 0.04],
    ],
    0.016,
    accent,
  );
  fin.geometry.applyMatrix4(
    new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1),
  );

  group.add(body, nose, tail, wings, stabiliser, fin);
  for (const x of [-0.22, 0.22]) {
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 14), accent);
    engine.position.set(x, 0.09, -0.06);
    group.add(engine);
  }
  // The layer's camera matrix holds the map projection; three's own culling would use the
  // wrong frustum for that.
  group.traverse((object) => (object.frustumCulled = false));
  return group;
}
