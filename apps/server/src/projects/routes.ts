import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { toValidationIssues } from '@travel-route-animator/core';
import {
  ProjectFileInvalidError,
  ProjectNotFoundError,
  ProjectValidationError,
  type ProjectStore,
} from './projectStore';

const CreateProjectBody = z.strictObject({
  name: z.string().trim().min(1, 'A project needs a name').max(200),
});

interface IdParams {
  id: string;
}

export function registerProjectRoutes(app: FastifyInstance, store: ProjectStore): void {
  void app.register((routes, _options, done) => {
    // Encapsulated: these error mappings only apply to the project routes.
    routes.setErrorHandler((error, _request, reply) => {
      if (error instanceof ProjectNotFoundError) {
        return reply.code(404).send({ error: 'not_found', message: error.message });
      }
      if (error instanceof ProjectValidationError) {
        return reply.code(400).send({
          error: 'invalid_project',
          message: 'The project is not valid',
          issues: error.issues,
        });
      }
      // 422 rather than 404: the project is there, but its stored file cannot be processed.
      if (error instanceof ProjectFileInvalidError) {
        return reply.code(422).send({
          error: 'invalid_project_file',
          message: error.message,
          file: error.file,
          issues: error.issues,
        });
      }
      return reply.send(error);
    });

    routes.get('/api/projects', () => store.list());

    routes.get<{ Params: IdParams }>('/api/projects/:id', (request) =>
      store.get(request.params.id),
    );

    routes.post('/api/projects', async (request, reply) => {
      const body = CreateProjectBody.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({
          error: 'invalid_request',
          message: 'Expected a JSON body like {"name": "Portugal 2026"}',
          issues: toValidationIssues(body.error),
        });
      }
      return reply.code(201).send(await store.create(body.data.name));
    });

    routes.put<{ Params: IdParams }>('/api/projects/:id', (request) =>
      store.update(request.params.id, request.body),
    );

    routes.delete<{ Params: IdParams }>('/api/projects/:id', async (request, reply) => {
      await store.remove(request.params.id);
      return reply.code(204).send();
    });

    done();
  });
}
