import {
  BUILT_IN_OVERLAY_STYLES,
  OverlayStyleSchema,
  resolveOverlayStyle,
  type OverlayStyle,
  type Project,
} from '@travel-route-animator/core';
import type { FastifyInstance } from 'fastify';
import {
  createNamedFileStore,
  replyToStoreError,
  type NamedFileStore,
} from '../lib/namedFileStore';

// Own overlay styles (M17), one file each in data/overlay-styles/, like own map themes: saved
// once from the inspector, chosen in any project.

export function createOverlayStyleStore({
  dataDir,
  warn,
}: {
  dataDir: string;
  warn?: (message: string) => void;
}) {
  return createNamedFileStore<OverlayStyle>({
    dataDir,
    folder: 'overlay-styles',
    what: 'overlay style',
    schema: OverlayStyleSchema,
    isValidId: (id) => OverlayStyleSchema.shape.id.safeParse(id).success,
    isBuiltIn: (id) => Object.hasOwn(BUILT_IN_OVERLAY_STYLES, id),
    ...(warn && { warn }),
  });
}

export type OverlayStyleStore = NamedFileStore<OverlayStyle>;

/** The own styles some of these stages name; a missing one is drawn as Classic. */
export async function overlayStylesOf(
  project: Project,
  etappeIds: readonly string[],
  styles: OverlayStyleStore,
): Promise<OverlayStyle[]> {
  const ids = new Set(etappeIds.map((id) => resolveOverlayStyle(project, id).value.styleId));
  const found = await Promise.all(
    [...ids]
      .filter((id) => !Object.hasOwn(BUILT_IN_OVERLAY_STYLES, id))
      .map((id) => styles.get(id).catch(() => undefined)),
  );
  return found.filter((style) => style !== undefined);
}

interface IdParams {
  id: string;
}

export function registerOverlayStyleRoutes(app: FastifyInstance, styles: OverlayStyleStore): void {
  void app.register((routes, _options, done) => {
    routes.setErrorHandler(
      (error, _request, reply) => replyToStoreError(error, reply) ?? reply.send(error),
    );
    routes.get('/api/overlay-styles', () => styles.list());
    routes.get<{ Params: IdParams }>('/api/overlay-styles/:id', (request) =>
      styles.get(request.params.id),
    );
    routes.put<{ Params: IdParams }>('/api/overlay-styles/:id', (request) =>
      styles.put(request.params.id, request.body),
    );
    routes.delete<{ Params: IdParams }>('/api/overlay-styles/:id', async (request, reply) => {
      await styles.remove(request.params.id);
      return reply.code(204).send();
    });
    done();
  });
}
