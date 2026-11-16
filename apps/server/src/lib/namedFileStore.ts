import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { toValidationIssues } from '@travel-route-animator/core';
import type { FastifyReply } from 'fastify';
import type { ZodType } from 'zod';
import { writeFileAtomic } from '../fs/writeFileAtomic';

// Own things that live outside every project, one JSON file each in a folder of data/, so any
// project can use them: map themes (ADR 0010) and overlay styles (M17). Built-in ones live in
// the code and are never stored here.

export class StoredNotFoundError extends Error {
  override name = 'StoredNotFoundError';
  constructor(what: string, id: string) {
    super(`There is no own ${what} "${id}"`);
  }
}

export class StoredInvalidError extends Error {
  override name = 'StoredInvalidError';
  constructor(
    /** The error code the API answers with, e.g. invalid_theme. */
    readonly code: string,
    message: string,
    readonly issues: ReturnType<typeof toValidationIssues> = [],
  ) {
    super(message);
  }
}

/** The API's answer to a store's error; undefined for any other error. */
export function replyToStoreError(error: unknown, reply: FastifyReply): FastifyReply | undefined {
  if (error instanceof StoredNotFoundError) {
    return reply.code(404).send({ error: 'not_found', message: error.message });
  }
  if (error instanceof StoredInvalidError) {
    return reply
      .code(400)
      .send({ error: error.code, message: error.message, issues: error.issues });
  }
  return undefined;
}

interface NamedFileStoreOptions<T> {
  dataDir: string;
  /** The folder in data/, e.g. "themes". */
  folder: string;
  /** What one item is called in messages and error codes, e.g. "theme" or "overlay style". */
  what: string;
  schema: ZodType<T>;
  /** Whether an ID is a valid file name; it is checked before any file is opened. */
  isValidId: (id: string) => boolean;
  isBuiltIn: (id: string) => boolean;
  warn?: (message: string) => void;
}

export function createNamedFileStore<T extends { id: string }>({
  dataDir,
  folder,
  what,
  schema,
  isValidId,
  isBuiltIn,
  warn = (message: string) => console.warn(message),
}: NamedFileStoreOptions<T>) {
  const dir = join(dataDir, folder);
  const fileOf = (id: string) => join(dir, `${id}.json`);
  const invalid = `invalid_${what.replace(/ /g, '_')}`;

  async function read(file: string): Promise<T | undefined> {
    try {
      const parsed = schema.safeParse(JSON.parse(await readFile(join(dir, file), 'utf8')));
      if (parsed.success) return parsed.data;
      warn(`Skipping ${folder}/${file}, it is not a valid ${what}`);
    } catch (error) {
      warn(`Cannot read ${folder}/${file}: ${String(error)}`);
    }
    return undefined;
  }

  return {
    async list(): Promise<T[]> {
      await mkdir(dir, { recursive: true });
      const files = (await readdir(dir)).filter((file) => file.endsWith('.json')).sort();
      const items = await Promise.all(files.map(read));
      return items.filter((item): item is Awaited<T> => item !== undefined);
    },

    async get(id: string): Promise<T> {
      const item = isValidId(id) ? await read(`${id}.json`).catch(() => undefined) : undefined;
      if (!item) throw new StoredNotFoundError(what, id);
      return item;
    },

    /** Creates or replaces an own item; the ID in the URL and in the body must agree. */
    async put(id: string, input: unknown): Promise<T> {
      const parsed = schema.safeParse(input);
      if (!parsed.success) {
        throw new StoredInvalidError(
          invalid,
          `The ${what} is not valid`,
          toValidationIssues(parsed.error),
        );
      }
      const item = parsed.data;
      if (item.id !== id) {
        throw new StoredInvalidError(invalid, `ID "${item.id}" does not match the URL`);
      }
      if (isBuiltIn(id)) throw new StoredInvalidError(invalid, `"${id}" is a built-in ${what}`);
      await mkdir(dir, { recursive: true });
      await writeFileAtomic(fileOf(id), `${JSON.stringify(item, null, 2)}\n`);
      return item;
    },

    async remove(id: string): Promise<void> {
      await this.get(id);
      await rm(fileOf(id), { force: true });
    },
  };
}

export type NamedFileStore<T extends { id: string }> = ReturnType<typeof createNamedFileStore<T>>;
