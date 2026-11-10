import type { PlaneType } from '@travel-route-animator/core';
import * as THREE from 'three';
import { PLANE_SHAPES, type PlaneShape } from './planeShapes';

// 3D planes built from their dimensions (planeShapes.ts): no model files, no licences, and as
// plain as the flat icons. Axes are east-north-up: the nose points along +Y, the wings along
// X, the fin up along +Z. The model is 1 long, so the layer scales it in metres.

const SIDE = THREE.DoubleSide;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Swaps the axes of a part drawn in the XY plane so it stands upright: x → Y, y → Z, z → X. */
const UPRIGHT = new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1);

function slab(points: [number, number][], thickness: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geometry.translate(0, 0, -thickness / 2);
  return geometry;
}

/** Where the parts of a type sit, in metres; shared by the builders below. */
function layout(shape: PlaneShape) {
  const length = shape.lengthM;
  const radius = shape.bodyWidthM / 2;
  const heightScale = (shape.bodyHeightM ?? shape.bodyWidthM) / shape.bodyWidthM;
  const noseLength = radius * 3.2;
  const tailLength = radius * 5.5;
  // The tail cone narrows to this share of the radius and sweeps up as it does.
  const tailRadius = (y: number) => {
    const f = Math.min(1, Math.max(0, (y + length / 2) / tailLength));
    return radius * (0.15 + 0.85 * Math.sin((f * Math.PI) / 2));
  };
  const tailLift = (y: number) => (radius - tailRadius(y)) * 0.65;
  const wingRoot = radius * 0.6;
  const wingZ = shape.highWing ? radius * heightScale * 0.78 : -radius * 0.42;
  const dihedral = Math.tan(toRad(shape.highWing ? 1.5 : 5));
  const sweep = Math.tan(toRad(shape.sweepDeg));
  const rootLeadingEdge = length / 2 - shape.wingAt * length;
  return {
    length,
    radius,
    heightScale,
    noseLength,
    tailLength,
    tailRadius,
    tailLift,
    wingRoot,
    wingZ,
    dihedral,
    sweep,
    rootLeadingEdge,
    /** Leading edge of the wing at a distance x from the middle. */
    leadingEdgeAt: (x: number) => rootLeadingEdge - (Math.abs(x) - wingRoot) * sweep,
    /** Height of the wing at x, with its upward bend (dihedral). */
    wingZAt: (x: number) => wingZ + Math.max(0, Math.abs(x) - wingRoot) * dihedral,
  };
}
type Layout = ReturnType<typeof layout>;

/** A turned profile: pointed nose, straight cabin, a tail cone that narrows and sweeps up. */
function fuselage(l: Layout): THREE.BufferGeometry {
  const { length, radius, noseLength, tailLength } = l;
  const points = [new THREE.Vector2(0, -length / 2)];
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const y = -length / 2 + (tailLength * i) / steps;
    points.push(new THREE.Vector2(l.tailRadius(y), y));
  }
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    points.push(
      new THREE.Vector2(radius * Math.sqrt(1 - f * f), length / 2 - noseLength * (1 - f)),
    );
  }
  const geometry = new THREE.LatheGeometry(points, 28);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    // The lathe turns the profile around Y; its cross-section lies in XZ, so Z is up.
    position.setZ(i, position.getZ(i) * l.heightScale + l.tailLift(y));
  }
  geometry.computeVertexNormals();
  return geometry;
}

function wing(shape: PlaneShape, l: Layout): THREE.BufferGeometry {
  const half = shape.spanM / 2;
  const tip = l.leadingEdgeAt(half);
  const { rootLeadingEdge: lead, wingRoot: root } = l;
  const geometry = slab(
    [
      [root, lead],
      [half, tip],
      [half, tip - shape.tipChordM],
      [root, lead - shape.rootChordM],
      [-root, lead - shape.rootChordM],
      [-half, tip - shape.tipChordM],
      [-half, tip],
      [-root, lead],
    ],
    shape.rootChordM * 0.06,
  );
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    position.setZ(i, position.getZ(i) + l.wingZAt(position.getX(i)));
  }
  geometry.computeVertexNormals();
  return geometry;
}

function winglets(shape: PlaneShape, l: Layout, material: THREE.Material): THREE.Mesh[] {
  const half = shape.spanM / 2;
  const height = shape.spanM * 0.065;
  const lead = l.leadingEdgeAt(half);
  const chord = shape.tipChordM;
  return [-1, 1].map((side) => {
    const geometry = slab(
      [
        [lead, 0],
        [lead - chord, 0],
        [lead - chord - height * 0.35, height],
        [lead - height * 0.7, height],
      ],
      0.12,
    );
    geometry.applyMatrix4(UPRIGHT);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(side * half, 0, l.wingZAt(half));
    return mesh;
  });
}

function engines(shape: PlaneShape, l: Layout, accent: THREE.Material): THREE.Object3D[] {
  const parts: THREE.Object3D[] = [];
  const diameter = shape.engineDiameterM;
  const prop = shape.propellerM;
  // Turbofans hang below and in front of the wing; turboprop nacelles sit under a high wing.
  const length = diameter * (prop ? 3.2 : 2.3);
  const disc = new THREE.MeshBasicMaterial({
    color: '#334155',
    transparent: true,
    opacity: 0.35,
    side: SIDE,
    depthWrite: false,
  });
  for (const share of shape.engines) {
    for (const side of [-1, 1]) {
      const x = side * share * (shape.spanM / 2);
      const y = l.leadingEdgeAt(x) + length * (prop ? 0.05 : 0.15);
      const z = l.wingZAt(x) - diameter * (prop ? 0.25 : 0.62);
      const nacelle = new THREE.Mesh(
        new THREE.CylinderGeometry((diameter / 2) * 0.95, (diameter / 2) * 0.75, length, 18),
        accent,
      );
      nacelle.position.set(x, y, z);
      parts.push(nacelle);
      if (prop) {
        const propeller = new THREE.Mesh(new THREE.CircleGeometry(prop / 2, 32), disc);
        // The disc faces forward (+Y); a circle starts out facing +Z.
        propeller.rotation.x = -Math.PI / 2;
        propeller.position.set(x, y + length / 2 + 0.15, z);
        parts.push(propeller);
      }
    }
  }
  return parts;
}

function tail(shape: PlaneShape, l: Layout, grey: THREE.Material, accent: THREE.Material) {
  const { length, radius, heightScale } = l;
  const finTrailing = -length / 2 + length * 0.02;
  const finLeading = finTrailing + shape.finChordM;
  const finSweep = Math.tan(toRad(38));
  const finRoot = radius * heightScale * 0.6;
  const finTop = radius * heightScale * 0.7 + shape.finHeightM;
  const topLeading = finLeading - (finTop - finRoot) * finSweep;
  const topChord = shape.finChordM * 0.45;
  const finGeometry = slab(
    [
      [finTrailing, finRoot],
      [finLeading, finRoot],
      [topLeading, finTop],
      [topLeading - topChord, finTop],
    ],
    shape.finChordM * 0.05,
  );
  finGeometry.applyMatrix4(UPRIGHT);
  const fin = new THREE.Mesh(finGeometry, accent);

  // The stabiliser sits at the tail cone, or on top of the fin (T-tail).
  const half = shape.stabiliserSpanM / 2;
  const rootChord = shape.tTail ? topChord * 1.1 : length * 0.11;
  const lead = shape.tTail ? topLeading : -length / 2 + length * 0.17;
  const z = shape.tTail ? finTop : l.tailLift(lead - rootChord / 2) + radius * 0.1;
  const sweep = Math.tan(toRad(shape.tTail ? 8 : shape.sweepDeg + 4));
  const root = shape.tTail ? 0 : radius * 0.3;
  const tip = lead - (half - root) * sweep;
  const stabiliserGeometry = slab(
    [
      [root, lead],
      [half, tip],
      [half, tip - rootChord * 0.4],
      [root, lead - rootChord],
      [-root, lead - rootChord],
      [-half, tip - rootChord * 0.4],
      [-half, tip],
      [-root, lead],
    ],
    rootChord * 0.06,
  );
  const stabiliser = new THREE.Mesh(stabiliserGeometry, grey);
  stabiliser.position.z = z;
  return [fin, stabiliser];
}

/** The 747's upper deck: a long bulge on top of the front fuselage. */
function hump(shape: PlaneShape, l: Layout, material: THREE.Material): THREE.Mesh[] {
  if (!shape.hump) return [];
  const { from, to } = shape.hump;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 14), material);
  mesh.scale.set(l.radius * 0.74, ((to - from) * l.length) / 2, l.radius * 0.78);
  mesh.position.set(0, l.length / 2 - ((from + to) / 2) * l.length, l.radius * 0.66);
  return [mesh];
}

/** A plane of the given type: white body, light grey wings, fin and engines in the track colour. */
export function buildPlane(type: PlaneType, color: string): THREE.Group {
  const shape = PLANE_SHAPES[type];
  const l = layout(shape);
  // Two-sided: the Mercator placement mirrors the model (y grows southwards there).
  const white = new THREE.MeshLambertMaterial({ color: '#f8fafc', side: SIDE });
  const grey = new THREE.MeshLambertMaterial({ color: '#cbd5e1', side: SIDE });
  const accent = new THREE.MeshLambertMaterial({ color, side: SIDE });

  const model = new THREE.Group();
  model.add(
    new THREE.Mesh(fuselage(l), white),
    ...hump(shape, l, white),
    new THREE.Mesh(wing(shape, l), grey),
    ...(shape.winglets ? winglets(shape, l, accent) : []),
    ...engines(shape, l, accent),
    ...tail(shape, l, grey, accent),
  );
  model.scale.setScalar(1 / shape.lengthM);
  const group = new THREE.Group();
  group.add(model);
  // The layer's camera matrix holds the map projection; three's own culling would use the
  // wrong frustum for that.
  group.traverse((object) => (object.frustumCulled = false));
  return group;
}
