import type { OpenGlRenderer } from '@remotion/renderer';

// Its own module, free of Remotion at runtime: the server checks RENDER_GL at start-up
// without loading the renderer.

export type { OpenGlRenderer };

/** The OpenGL backends Chromium can render the maps with; 'angle' is the GPU. */
export const GL_RENDERERS: readonly OpenGlRenderer[] = [
  'angle',
  'angle-egl',
  'egl',
  'swangle',
  'swiftshader',
  'vulkan',
];
