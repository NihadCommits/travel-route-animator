import { useEffect, useRef, useState, type FC } from 'react';
import { AbsoluteFill, useDelayRender } from 'remotion';
import * as THREE from 'three';

// Models side by side in a grid, for checking their proportions in Remotion Studio after
// changing their shapes (PlaneTypes, CarTypes). Not part of any video.

export const MODEL_GRID_SIZE = { width: 1920, height: 1080 };

export interface ModelGridProps {
  items: { label: string; build: () => THREE.Object3D }[];
  columns: number;
  rows: number;
  /** Where the camera stands, east-north-up like the map; it looks at the middle. */
  eye: [number, number, number];
  lookAt?: [number, number, number];
  fov?: number;
}

export const ModelGrid: FC<ModelGridProps> = ({ items, columns, rows, eye, lookAt, fov = 28 }) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { delayRender, continueRender } = useDelayRender();
  const [handle] = useState(() => delayRender('Drawing the models'));

  useEffect(() => {
    if (!canvas.current) return;
    const { width, height } = MODEL_GRID_SIZE;
    const renderer = new THREE.WebGLRenderer({
      canvas: canvas.current,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(width, height, false);
    renderer.setClearColor('#dfe7ee');
    renderer.clear();
    renderer.setScissorTest(true);
    const cellWidth = width / columns;
    const cellHeight = height / rows;
    items.forEach(({ build }, i) => {
      const scene = new THREE.Scene();
      // The same light as the map's 3D layer.
      scene.add(new THREE.HemisphereLight('#ffffff', '#94a3b8', 2.2));
      const sun = new THREE.DirectionalLight('#ffffff', 1.6);
      sun.position.set(0.4, -0.6, 1);
      scene.add(sun, build());
      const camera = new THREE.PerspectiveCamera(fov, cellWidth / cellHeight, 0.01, 100);
      camera.up.set(0, 0, 1);
      camera.position.set(...eye);
      camera.lookAt(...(lookAt ?? [0, 0, 0]));
      // WebGL counts rows from the bottom.
      const x = (i % columns) * cellWidth;
      const y = (rows - 1 - Math.floor(i / columns)) * cellHeight;
      renderer.setViewport(x, y, cellWidth, cellHeight);
      renderer.setScissor(x, y, cellWidth, cellHeight);
      renderer.clear();
      renderer.render(scene, camera);
    });
    continueRender(handle);
    return () => renderer.dispose();
  }, [continueRender, handle, items, columns, rows, eye, lookAt, fov]);

  return (
    <AbsoluteFill>
      <canvas ref={canvas} style={{ width: '100%', height: '100%' }} />
      {items.map(({ label }, i) => (
        <div
          key={label}
          style={{
            position: 'absolute',
            left: `${((i % columns) * 100) / columns}%`,
            top: `${(Math.floor(i / columns) * 100) / rows}%`,
            padding: 16,
            font: '600 26px system-ui, sans-serif',
            color: '#1f2937',
          }}
        >
          {label}
        </div>
      ))}
    </AbsoluteFill>
  );
};
