import { PLANE_TYPES } from '@travel-route-animator/core';
import { useEffect, useRef, useState, type FC } from 'react';
import { AbsoluteFill, useDelayRender } from 'remotion';
import * as THREE from 'three';
import { buildPlane } from '../vehicles/planeModel';

// All aircraft types side by side, seen from the front left: for checking their proportions
// in Remotion Studio (pnpm studio) after changing planeShapes.ts. Not part of any video.

export const PLANE_TYPES_COMPOSITION_ID = 'PlaneTypes';
export const PLANE_TYPES_SIZE = { width: 1920, height: 1080 };

const COLUMNS = 4;
const ROWS = 3;

export const PlaneTypesComposition: FC = () => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { delayRender, continueRender } = useDelayRender();
  const [handle] = useState(() => delayRender('Drawing the plane types'));

  useEffect(() => {
    if (!canvas.current) return;
    const { width, height } = PLANE_TYPES_SIZE;
    const renderer = new THREE.WebGLRenderer({
      canvas: canvas.current,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(width, height, false);
    renderer.setClearColor('#dfe7ee');
    renderer.clear();
    renderer.setScissorTest(true);
    const cellWidth = width / COLUMNS;
    const cellHeight = height / ROWS;
    PLANE_TYPES.forEach((type, i) => {
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight('#ffffff', '#94a3b8', 2.2));
      const sun = new THREE.DirectionalLight('#ffffff', 1.6);
      sun.position.set(0.4, -0.6, 1);
      scene.add(sun, buildPlane(type, '#F2A541'));
      const camera = new THREE.PerspectiveCamera(28, cellWidth / cellHeight, 0.01, 100);
      // East-north-up like the map: looking from the front left and above at the nose (+Y).
      camera.up.set(0, 0, 1);
      camera.position.set(-1.35, 1.25, 0.95);
      camera.lookAt(0, -0.05, 0);
      // WebGL counts rows from the bottom.
      const x = (i % COLUMNS) * cellWidth;
      const y = (ROWS - 1 - Math.floor(i / COLUMNS)) * cellHeight;
      renderer.setViewport(x, y, cellWidth, cellHeight);
      renderer.setScissor(x, y, cellWidth, cellHeight);
      renderer.clear();
      renderer.render(scene, camera);
    });
    continueRender(handle);
    return () => renderer.dispose();
  }, [continueRender, handle]);

  return (
    <AbsoluteFill>
      <canvas ref={canvas} style={{ width: '100%', height: '100%' }} />
      {PLANE_TYPES.map((type, i) => (
        <div
          key={type}
          style={{
            position: 'absolute',
            left: `${((i % COLUMNS) * 100) / COLUMNS}%`,
            top: `${(Math.floor(i / COLUMNS) * 100) / ROWS}%`,
            padding: 16,
            font: '600 26px system-ui, sans-serif',
            color: '#1f2937',
          }}
        >
          {type}
        </div>
      ))}
    </AbsoluteFill>
  );
};
