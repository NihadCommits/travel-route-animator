import { ThemeSchema, type Theme } from '@travel-route-animator/core';
import { isBuiltInTheme } from '@travel-route-animator/styles';
import { createNamedFileStore, type NamedFileStore } from '../lib/namedFileStore';

// Own map themes (ADR 0010), one file each in data/themes/.

export function createThemeStore({
  dataDir,
  warn,
}: {
  dataDir: string;
  warn?: (message: string) => void;
}) {
  return createNamedFileStore<Theme>({
    dataDir,
    folder: 'themes',
    what: 'theme',
    schema: ThemeSchema,
    isValidId: (id) => ThemeSchema.shape.id.safeParse(id).success,
    isBuiltIn: isBuiltInTheme,
    ...(warn && { warn }),
  });
}

export type ThemeStore = NamedFileStore<Theme>;
