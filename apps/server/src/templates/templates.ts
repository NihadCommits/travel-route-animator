import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  TemplateIdSchema,
  TemplateSchema,
  toValidationIssues,
  type Template,
} from '@travel-route-animator/core';
import type { FastifyInstance } from 'fastify';
import { writeFileAtomic } from '../fs/writeFileAtomic';

// Stage and group templates (M14), one file each in data/templates/, outside every project, so
// that any project can start from them. A template of an older file format is skipped with a
// warning: there are no migrations for templates yet.

export class TemplateNotFoundError extends Error {
  override name = 'TemplateNotFoundError';
  constructor(id: string) {
    super(`There is no template "${id}"`);
  }
}

export class TemplateInvalidError extends Error {
  override name = 'TemplateInvalidError';
  constructor(
    message: string,
    readonly issues: ReturnType<typeof toValidationIssues> = [],
  ) {
    super(message);
  }
}

export function createTemplateStore({
  dataDir,
  warn = (message: string) => console.warn(message),
}: {
  dataDir: string;
  warn?: (message: string) => void;
}) {
  const dir = join(dataDir, 'templates');
  const fileOf = (id: string) => join(dir, `${id}.json`);

  async function read(file: string): Promise<Template | undefined> {
    try {
      const parsed = TemplateSchema.safeParse(JSON.parse(await readFile(join(dir, file), 'utf8')));
      if (parsed.success) return parsed.data;
      warn(`Skipping templates/${file}, it is not a valid template of this version`);
    } catch (error) {
      warn(`Cannot read templates/${file}: ${String(error)}`);
    }
    return undefined;
  }

  return {
    /** Every template, newest first. */
    async list(): Promise<Template[]> {
      await mkdir(dir, { recursive: true });
      const files = (await readdir(dir)).filter((file) => file.endsWith('.json'));
      const templates = (await Promise.all(files.map(read))).filter(
        (template): template is Template => template !== undefined,
      );
      return templates.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async put(id: string, input: unknown): Promise<Template> {
      const parsed = TemplateSchema.safeParse(input);
      if (!parsed.success) {
        throw new TemplateInvalidError(
          'The template is not valid',
          toValidationIssues(parsed.error),
        );
      }
      if (parsed.data.id !== id) {
        throw new TemplateInvalidError(`Template ID "${parsed.data.id}" does not match the URL`);
      }
      await mkdir(dir, { recursive: true });
      await writeFileAtomic(fileOf(id), `${JSON.stringify(parsed.data, null, 2)}\n`);
      return parsed.data;
    },

    async remove(id: string): Promise<void> {
      if (!TemplateIdSchema.safeParse(id).success) throw new TemplateNotFoundError(id);
      try {
        await rm(fileOf(id));
      } catch {
        throw new TemplateNotFoundError(id);
      }
    },
  };
}

export type TemplateStore = ReturnType<typeof createTemplateStore>;

export function registerTemplateRoutes(app: FastifyInstance, templates: TemplateStore): void {
  void app.register((routes, _options, done) => {
    routes.setErrorHandler((error, _request, reply) => {
      if (error instanceof TemplateNotFoundError) {
        return reply.code(404).send({ error: 'not_found', message: error.message });
      }
      if (error instanceof TemplateInvalidError) {
        return reply
          .code(400)
          .send({ error: 'invalid_template', message: error.message, issues: error.issues });
      }
      return reply.send(error);
    });

    routes.get('/api/templates', () => templates.list());
    routes.put<{ Params: { id: string } }>('/api/templates/:id', (request) =>
      templates.put(request.params.id, request.body),
    );
    routes.delete<{ Params: { id: string } }>('/api/templates/:id', async (request, reply) => {
      await templates.remove(request.params.id);
      return reply.code(204).send();
    });

    done();
  });
}
