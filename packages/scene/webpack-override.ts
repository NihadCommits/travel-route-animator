import type { WebpackOverrideFn } from '@remotion/bundler';

/**
 * Shared by Remotion Studio (remotion.config.ts) and the render scripts (bundle()).
 *
 * In development Remotion names assets after their source path ([path][name][ext]). For the
 * MapLibre worker that path is ../../node_modules/..., which points outside the bundle, so
 * Remotion Studio cannot serve it. Give the worker a plain file name in every environment.
 */
export const webpackOverride: WebpackOverrideFn = (config) => ({
  ...config,
  module: {
    ...config.module,
    rules: [
      ...(config.module?.rules ?? []),
      {
        test: /maplibre-gl-worker\.mjs$/,
        dependency: 'url',
        type: 'asset/resource',
        generator: { filename: 'static/[name]-[contenthash][ext]' },
      },
    ],
  },
});
