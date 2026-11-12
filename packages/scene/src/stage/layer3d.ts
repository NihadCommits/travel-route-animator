import type { LineDash } from '@travel-route-animator/core';
import {
  MercatorCoordinate,
  type CustomLayerInterface,
  type Map as MapLibreMap,
} from 'maplibre-gl';
import * as THREE from 'three';
import { buildCar } from '../vehicles/carModel';
import type { DecodedImage } from '../vehicles/images';
import { buildPlane } from '../vehicles/planeModel';
import type { ArcLine, Drawings3d, FlightArc, ModelDrawing } from './data3d';

// The 3D layer of tilted views: flight arcs, and the models of planes and cars (ADR 0007).
// Loaded only when a stage needs it, as it brings three.js along. MapLibre calls render() for
// every frame it draws; everything drawn comes from the drawings handed over for the current
// frame. Between frames only the built models are kept, for reuse; their pose is set anew.
//
// Every point is given twice, on MapLibre's unit globe and in Mercator, and the shader mixes
// the two like MapLibre's own shaders do. That keeps the arc right on the globe, on the flat
// map and in the blend between them at high zoom.

/** MapLibre's globe radius (GLOBE_RADIUS in its shaders). */
const GLOBE_RADIUS_M = 6_371_008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

type Vec3 = [number, number, number];
type LngLatTuple = readonly [number, number];

/** The point on MapLibre's unit globe (y to the north pole), lifted by the height. */
function globePos([lng, lat]: LngLatTuple, altitudeM: number): Vec3 {
  const l = toRad(lng);
  const p = toRad(lat);
  const r = 1 + altitudeM / GLOBE_RADIUS_M;
  return [Math.sin(l) * Math.cos(p) * r, Math.sin(p) * r, Math.cos(l) * Math.cos(p) * r];
}

function mercPos(lngLat: LngLatTuple, altitudeM: number): Vec3 {
  const m = MercatorCoordinate.fromLngLat([lngLat[0], lngLat[1]], altitudeM);
  return [m.x, m.y, m.z];
}

const VERTEX = `#version 300 es
precision highp float;
uniform mat4 u_main;
uniform mat4 u_fallback;
uniform float u_t;
uniform vec2 u_half;
uniform float u_half_width;
in vec3 a_prev_m; in vec3 a_prev_g;
in vec3 a_cur_m; in vec3 a_cur_g;
in vec3 a_next_m; in vec3 a_next_g;
in float a_side;
in float a_dist;
out float v_across;
out float v_dist;
// MapLibre's blend between its flat and its globe matrix (interpolateProjectionFor3D).
vec4 project(vec3 m, vec3 g) { return mix(u_fallback * vec4(m, 1.0), u_main * vec4(g, 1.0), u_t); }
vec2 screen(vec4 c) { return c.xy / c.w * u_half; }
void main() {
  vec4 cur = project(a_cur_m, a_cur_g);
  // A ribbon of constant width on screen: offset sideways from the direction the line runs in
  // on screen, taken from its neighbours so that the joins line up.
  vec2 d = screen(project(a_next_m, a_next_g)) - screen(project(a_prev_m, a_prev_g));
  vec2 dir = length(d) > 0.0 ? normalize(d) : vec2(1.0, 0.0);
  vec2 normal = vec2(-dir.y, dir.x);
  // One pixel more on each side for the antialiased edge.
  float extent = u_half_width + 1.0;
  v_across = a_side * extent;
  v_dist = a_dist;
  gl_Position = vec4(cur.xy + normal * a_side * extent / u_half * cur.w, cur.z, cur.w);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform vec4 u_color;
uniform float u_half_width;
uniform float u_soft;
uniform vec2 u_dash;
uniform float u_dot;
uniform float u_px_per_m;
in float v_across;
in float v_dist;
out vec4 fragColor;
void main() {
  float across = abs(v_across);
  float a = clamp(u_half_width + 0.5 - across, 0.0, 1.0);
  // Glow: fades out towards its edge instead of a hard border.
  if (u_soft > 0.5) a = pow(clamp(1.0 - across / u_half_width, 0.0, 1.0), 2.0);
  if (u_dash.x > 0.0) {
    float period = u_dash.x + u_dash.y;
    float along = mod(v_dist * u_px_per_m, period);
    if (u_dot > 0.5) {
      // Round dots of the line's width, like the flat layer's dotted lines.
      a *= clamp(u_half_width + 0.5 - length(vec2(along - period * 0.5, across)), 0.0, 1.0);
    } else {
      a *= clamp(min(along, u_dash.x - along) + 0.5, 0.0, 1.0);
    }
  }
  a *= u_color.a;
  fragColor = vec4(u_color.rgb * a, a);
}`;

const ATTRIBUTES = ['a_prev_m', 'a_prev_g', 'a_cur_m', 'a_cur_g', 'a_next_m', 'a_next_g'] as const;
/** Six positions, the side and the distance along the line. */
const FLOATS_PER_VERTEX = ATTRIBUTES.length * 3 + 2;
const UNIFORMS = [
  'u_main',
  'u_fallback',
  'u_t',
  'u_half',
  'u_half_width',
  'u_color',
  'u_soft',
  'u_dash',
  'u_dot',
  'u_px_per_m',
] as const;

/** In multiples of the line width, as in the flat layers (layers.ts DASHES). */
const DASHES = { solid: [0, 0], dashed: [2, 1.6], dotted: [1, 1] } as const;
const GLOW_OPACITY = 0.55;

/** sRGB channels as the canvas expects them (THREE.Color would turn them linear). */
function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`Flight arc shader: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

/** Two vertices per point, one on each side of the line. */
function ribbon(line: ArcLine): Float32Array {
  const { points, altitudesM } = line;
  const merc = points.map((p, i) => mercPos(p, altitudesM[i] ?? 0));
  const globe = points.map((p, i) => globePos(p, altitudesM[i] ?? 0));
  const data = new Float32Array(points.length * 2 * FLOATS_PER_VERTEX);
  let distance = 0;
  let o = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) {
      // Ground distance is enough for the dash pattern; flat approximation per segment.
      const [lng0, lat0] = points[i - 1]!;
      const [lng1, lat1] = points[i]!;
      const x = toRad(lng1 - lng0) * Math.cos(toRad((lat0 + lat1) / 2));
      distance += Math.hypot(x, toRad(lat1 - lat0)) * GLOBE_RADIUS_M;
    }
    const prev = Math.max(0, i - 1);
    const next = Math.min(points.length - 1, i + 1);
    for (const side of [-1, 1]) {
      for (const v of [merc[prev]!, globe[prev]!, merc[i]!, globe[i]!, merc[next]!, globe[next]!]) {
        data[o++] = v[0];
        data[o++] = v[1];
        data[o++] = v[2];
      }
      data[o++] = side;
      data[o++] = distance;
    }
  }
  return data;
}

/**
 * Where a model sits: east-north-up at its point, from metres to the space of the map's
 * matrix. Built for both projections; render() mixes them like the shader does.
 */
function placement(head: ModelDrawing['head'], metres: number) {
  const [lng, lat] = head.lngLat;
  const m = MercatorCoordinate.fromLngLat([lng, lat], head.altitudeM);
  const s = metres * m.meterInMercatorCoordinateUnits();
  // Mercator y grows southwards, so north is -y there.
  const merc = new THREE.Matrix4().set(s, 0, 0, m.x, 0, -s, 0, m.y, 0, 0, s, m.z, 0, 0, 0, 1);
  const l = toRad(lng);
  const p = toRad(lat);
  const g = metres / GLOBE_RADIUS_M;
  const east = new THREE.Vector3(Math.cos(l), 0, -Math.sin(l)).multiplyScalar(g);
  const north = new THREE.Vector3(
    -Math.sin(l) * Math.sin(p),
    Math.cos(p),
    -Math.cos(l) * Math.sin(p),
  ).multiplyScalar(g);
  const pos = new THREE.Vector3(...globePos(head.lngLat, head.altitudeM));
  const up = pos.clone().normalize().multiplyScalar(g);
  const globe = new THREE.Matrix4().makeBasis(east, north, up).setPosition(pos);
  return { merc, globe };
}

export interface Layer3d extends CustomLayerInterface {
  /** What to draw in the coming frame. */
  setDrawings(drawings: Drawings3d): void;
  /** The stage's own images, decoded; cards take their pictures from here (ADR 0009). */
  setImages(images: ReadonlyMap<string, DecodedImage>): void;
}

interface Projection {
  main: THREE.Matrix4;
  fallback: THREE.Matrix4;
  /** MapLibre's blend from the flat map (0) to the globe (1). */
  t: number;
}

/** A picture as a texture; the canvas keeps three's colour handling the same as for files. */
function pictureTexture(picture: ImageData): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = picture.width;
  canvas.height = picture.height;
  canvas.getContext('2d')!.putImageData(picture, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildModel({ model, color }: ModelDrawing): THREE.Group {
  return model.kind === 'plane' ? buildPlane(model.type, color) : buildCar(model.type, color);
}

export function createLayer3d(): Layer3d {
  let drawings: Drawings3d = { arcs: [], models: [], cards: [] };
  let images: ReadonlyMap<string, DecodedImage> = new Map();
  const textures = new Map<string, THREE.Texture>();
  let map: MapLibreMap | undefined;
  let gl: WebGL2RenderingContext | undefined;
  let program: WebGLProgram | null = null;
  let vao: WebGLVertexArrayObject | null = null;
  let buffer: WebGLBuffer | null = null;
  const uniforms = {} as Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>;

  let renderer: THREE.WebGLRenderer | undefined;
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const models = new Map<string, THREE.Group>();
  // One card for every own image; its picture and size change with each drawing.
  const cardMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const card = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), cardMaterial);
  card.frustumCulled = false;
  card.visible = false;
  scene.add(card);
  scene.add(new THREE.HemisphereLight('#ffffff', '#94a3b8', 2.2));
  const sun = new THREE.DirectionalLight('#ffffff', 1.6);
  // Light from above, a little from the south-east, in the model's east-north-up space.
  sun.position.set(0.4, -0.6, 1);
  scene.add(sun);

  function drawLine(
    line: ArcLine,
    drawing: FlightArc,
    pass: { widthPx: number; color: string; alpha: number; soft?: boolean; dash: LineDash },
  ) {
    const g = gl!;
    const pixelRatio = map!.getPixelRatio();
    const width = pass.widthPx * pixelRatio;
    const [on, off] = DASHES[pass.dash];
    g.bufferData(g.ARRAY_BUFFER, ribbon(line), g.DYNAMIC_DRAW);
    g.uniform1f(uniforms.u_half_width, width / 2);
    g.uniform4f(uniforms.u_color, ...rgb(pass.color), pass.alpha);
    g.uniform1f(uniforms.u_soft, pass.soft ? 1 : 0);
    g.uniform2f(uniforms.u_dash, on * width, off * width);
    g.uniform1f(uniforms.u_dot, pass.dash === 'dotted' ? 1 : 0);
    g.uniform1f(uniforms.u_px_per_m, pixelRatio / drawing.metersPerPx);
    g.drawArrays(g.TRIANGLE_STRIP, 0, line.points.length * 2);
  }

  function drawArcs() {
    for (const drawing of drawings.arcs) {
      const { widthPx, color, dash } = drawing;
      const { ahead } = drawing;
      if (ahead) {
        drawLine(ahead, drawing, { widthPx, color, alpha: ahead.opacity, dash: ahead.dash });
      }
      if (drawing.glow) {
        drawLine(drawing.arc, drawing, {
          widthPx: widthPx * 3,
          color,
          alpha: GLOW_OPACITY,
          soft: true,
          dash: 'solid',
        });
      }
      // A white casing keeps a solid line readable, as on the flat layers.
      if (dash === 'solid') {
        drawLine(drawing.arc, drawing, {
          widthPx: widthPx + 4,
          color: '#ffffff',
          alpha: 1,
          dash: 'solid',
        });
      }
      drawLine(drawing.arc, drawing, { widthPx, color, alpha: 1, dash });
    }
  }

  /**
   * Puts the camera at a drawing: the placement goes into the camera matrix, so three's world
   * is east-north-up metres at the drawing and its lights need no projection at all.
   */
  function placeCamera(head: ModelDrawing['head'], metres: number, projection: Projection) {
    const { main, fallback, t } = projection;
    const placed = placement(head, metres);
    const flat = fallback.clone().multiply(placed.merc);
    const round = main.clone().multiply(placed.globe);
    const blended = new THREE.Matrix4();
    for (let i = 0; i < 16; i++) {
      blended.elements[i] = flat.elements[i]! * (1 - t) + round.elements[i]! * t;
    }
    camera.projectionMatrix.copy(blended);
    camera.projectionMatrixInverse.copy(blended).invert();
  }

  /** Shows one object of the scene and hides the others. */
  function showOnly(shown: THREE.Object3D) {
    for (const model of models.values()) model.visible = model === shown;
    card.visible = card === shown;
  }

  function textureOf(assetId: string, frame: number): THREE.Texture | undefined {
    const key = `${assetId}:${frame}`;
    const known = textures.get(key);
    if (known) return known;
    const picture = images.get(assetId)?.frames[frame];
    if (!picture) return undefined;
    const texture = pictureTexture(picture);
    textures.set(key, texture);
    return texture;
  }

  function drawCards(projection: Projection) {
    for (const drawing of drawings.cards) {
      const picture = images.get(drawing.assetId)?.frames[drawing.frame];
      const texture = textureOf(drawing.assetId, drawing.frame);
      // Not decoded yet: the editor's preview catches up a moment later; a render waits.
      if (!picture || !texture) continue;
      if (cardMaterial.map !== texture) {
        cardMaterial.map = texture;
        cardMaterial.needsUpdate = true;
      }
      const longer = Math.max(picture.width, picture.height);
      const height = picture.height / longer;
      card.scale.set(picture.width / longer, height, 1);
      if (drawing.upright) {
        // Stood up (top to the sky, face to the south), then turned to face a camera that
        // looks along its bearing; it stands on the plane's point.
        card.rotation.set(Math.PI / 2, 0, -toRad(drawing.bearingDeg), 'ZXY');
        card.position.set(0, 0, height / 2);
      } else {
        // Level, its top along the heading, nose up while climbing like a model.
        card.rotation.set(toRad(drawing.head.climbDeg), 0, -toRad(drawing.bearingDeg), 'ZXY');
        card.position.set(0, 0, 0);
      }
      showOnly(card);
      placeCamera(drawing.head, drawing.sizeM, projection);
      renderer!.render(scene, camera);
    }
  }

  function drawModels(projection: Projection) {
    const g = gl!;
    renderer!.resetState();
    renderer!.setViewport(0, 0, g.drawingBufferWidth, g.drawingBufferHeight);
    // The models hide each other, but the map's depth is not theirs. Cleared once: every
    // model's camera below ends in the same clip space, so their depths compare.
    renderer!.clearDepth();
    for (const drawing of drawings.models) {
      const { model } = drawing;
      const key = `${drawing.trackId}:${model.kind}:${model.type}:${drawing.color}`;
      let object = models.get(key);
      if (!object) {
        object = buildModel(drawing);
        models.set(key, object);
        scene.add(object);
      }
      showOnly(object);
      placeCamera(drawing.head, drawing.lengthM, projection);
      // Pitch first (nose up), then turn to the heading, clockwise from north.
      object.rotation.set(toRad(drawing.head.climbDeg), 0, -toRad(drawing.head.bearingDeg), 'ZXY');
      renderer!.render(scene, camera);
    }
    drawCards(projection);
    renderer!.resetState();
  }

  return {
    id: 'tra-3d',
    type: 'custom',
    renderingMode: '3d',
    setDrawings(next) {
      drawings = next;
    },
    setImages(next) {
      images = next;
    },
    onAdd(mapInstance, g) {
      map = mapInstance;
      gl = g;
      program = g.createProgram();
      g.attachShader(program, compile(g, g.VERTEX_SHADER, VERTEX));
      g.attachShader(program, compile(g, g.FRAGMENT_SHADER, FRAGMENT));
      g.linkProgram(program);
      if (!g.getProgramParameter(program, g.LINK_STATUS)) {
        throw new Error(`Flight arc program: ${g.getProgramInfoLog(program)}`);
      }
      for (const name of UNIFORMS) uniforms[name] = g.getUniformLocation(program, name);
      vao = g.createVertexArray();
      buffer = g.createBuffer();
      g.bindVertexArray(vao);
      g.bindBuffer(g.ARRAY_BUFFER, buffer);
      const stride = FLOATS_PER_VERTEX * 4;
      ATTRIBUTES.forEach((name, i) => {
        const location = g.getAttribLocation(program!, name);
        g.enableVertexAttribArray(location);
        g.vertexAttribPointer(location, 3, g.FLOAT, false, stride, i * 12);
      });
      for (const [name, offset] of [
        ['a_side', ATTRIBUTES.length * 12],
        ['a_dist', ATTRIBUTES.length * 12 + 4],
      ] as const) {
        const location = g.getAttribLocation(program, name);
        g.enableVertexAttribArray(location);
        g.vertexAttribPointer(location, 1, g.FLOAT, false, stride, offset);
      }
      g.bindVertexArray(null);

      renderer = new THREE.WebGLRenderer({ canvas: mapInstance.getCanvas(), context: g });
      renderer.autoClear = false;
    },
    render(g, args) {
      if (drawings.arcs.length + drawings.models.length + drawings.cards.length === 0) return;
      const { mainMatrix, fallbackMatrix, projectionTransition } = args.defaultProjectionData;
      const t = projectionTransition ?? 0;

      g.useProgram(program);
      g.bindVertexArray(vao);
      g.bindBuffer(g.ARRAY_BUFFER, buffer);
      g.uniformMatrix4fv(uniforms.u_main, false, new Float32Array(mainMatrix));
      g.uniformMatrix4fv(uniforms.u_fallback, false, new Float32Array(fallbackMatrix));
      g.uniform1f(uniforms.u_t, t);
      g.uniform2f(uniforms.u_half, g.drawingBufferWidth / 2, g.drawingBufferHeight / 2);
      // The arcs float above the map: no depth test against the tiles.
      g.disable(g.DEPTH_TEST);
      g.disable(g.CULL_FACE);
      g.enable(g.BLEND);
      // Premultiplied alpha, as MapLibre blends.
      g.blendFunc(g.ONE, g.ONE_MINUS_SRC_ALPHA);
      drawArcs();
      g.bindVertexArray(null);

      drawModels({
        main: new THREE.Matrix4().fromArray(mainMatrix),
        fallback: new THREE.Matrix4().fromArray(fallbackMatrix),
        t,
      });
    },
    onRemove() {
      for (const texture of textures.values()) texture.dispose();
      renderer?.dispose();
      gl?.deleteBuffer(buffer);
      gl?.deleteVertexArray(vao);
      gl?.deleteProgram(program);
    },
  };
}
