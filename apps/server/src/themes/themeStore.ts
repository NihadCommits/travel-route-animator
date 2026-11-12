import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { ThemeSchema, toValidationIssues, type Theme } from '@travel-route-animator/core';
import { isBuiltInTheme } from '@travel-route-animator/styles';
import { writeFileAtomic } from '../fs/writeFileAtomic';

// Own map themes (ADR 0010), one file each in data/themes/, outside every project, so that any
// project can use them. Built-in themes live in packages/styles and are never stored here.

export class ThemeNotFoundError extends Error {
  override name = 'ThemeNotFoundError';
  constructor(id: string) {
    super(`There is no own theme "${id}"`);
  }
}

export class ThemeInvalidError extends Error {
  override name = 'ThemeInvalidError';
  constructor(
    message: string,
    readonly issues: ReturnType<typeof toValidationIssues> = [],
  ) {
    super(message);
  }
}

export function createThemeStore({
  dataDir,
  warn = (message: string) => console.warn(message),
}: {
  dataDir: string;
  warn?: (message: string) => void;
}) {
  const dir = join(dataDir, 'themes');
  const fileOf = (id: string) => join(dir, `${id}.json`);

  async function read(file: string): Promise<Theme | undefined> {
    try {
      const parsed = ThemeSchema.safeParse(JSON.parse(await readFile(join(dir, file), 'utf8')));
      if (parsed.success) return parsed.data;
      warn(`Skipping themes/${file}, it is not a valid theme`);
    } catch (error) {
      warn(`Cannot read themes/${file}: ${String(error)}`);
    }
    return undefined;
  }

  return {
    async list(): Promise<Theme[]> {
      await mkdir(dir, { recursive: true });
      const files = (await readdir(dir)).filter((file) => file.endsWith('.json')).sort();
      const themes = await Promise.all(files.map(read));
      return themes.filter((theme): theme is Theme => theme !== undefined);
    },

    async get(id: string): Promise<Theme> {
      const theme = ThemeSchema.shape.id.safeParse(id).success
        ? await read(`${id}.json`).catch(() => undefined)
        : undefined;
      if (!theme) throw new ThemeNotFoundError(id);
      return theme;
    },

    /** Creates or replaces an own theme; the ID in the URL and in the body must agree. */
    async put(id: string, input: unknown): Promise<Theme> {
      const parsed = ThemeSchema.safeParse(input);
      if (!parsed.success) {
        throw new ThemeInvalidError('The theme is not valid', toValidationIssues(parsed.error));
      }
      const theme = parsed.data;
      if (theme.id !== id)
        throw new ThemeInvalidError(`Theme ID "${theme.id}" does not match the URL`);
      if (isBuiltInTheme(id)) throw new ThemeInvalidError(`"${id}" is a built-in theme`);
      await mkdir(dir, { recursive: true });
      await writeFileAtomic(fileOf(id), `${JSON.stringify(theme, null, 2)}\n`);
      return theme;
    },

    async remove(id: string): Promise<void> {
      await this.get(id);
      await rm(fileOf(id), { force: true });
    },
  };
}

export type ThemeStore = ReturnType<typeof createThemeStore>;
