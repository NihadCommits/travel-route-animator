import { CURRENT_SCHEMA_VERSION, type Project } from '../model/project';
import { validateProject, type ValidationResult } from '../model/validation';
import { v1ToV2 } from './v1-to-v2';
import { v2ToV3 } from './v2-to-v3';

/**
 * One step of the file format, e.g. version 1 → 2. A migration receives plain JSON (not a
 * typed Project, because old files do not match the current types) and must not mutate it.
 */
export interface Migration {
  from: number;
  to: number;
  migrate: (data: Readonly<Record<string, unknown>>) => Record<string, unknown>;
}

/**
 * All migrations in order. When the format changes: add a step here (one file per step, e.g.
 * v2-to-v3.ts), bump CURRENT_SCHEMA_VERSION, write a test with an old file.
 */
export const MIGRATIONS: readonly Migration[] = [v1ToV2, v2ToV3];

export class MigrationError extends Error {
  override name = 'MigrationError';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Brings a parsed project file up to `targetVersion`, one step at a time. */
export function runMigrations(
  raw: unknown,
  migrations: readonly Migration[] = MIGRATIONS,
  targetVersion: number = CURRENT_SCHEMA_VERSION,
): Record<string, unknown> {
  if (!isRecord(raw)) throw new MigrationError('A project file must contain a JSON object');

  const declared = raw.schemaVersion;
  if (typeof declared !== 'number' || !Number.isInteger(declared) || declared < 1) {
    throw new MigrationError(
      `schemaVersion must be a positive integer, got ${JSON.stringify(declared)}`,
    );
  }
  if (declared > targetVersion) {
    throw new MigrationError(
      `This project uses file format ${declared}, but this app only understands up to ${targetVersion}. Update the app.`,
    );
  }

  let version = declared;
  let data = raw;
  while (version < targetVersion) {
    const step = migrations.find((migration) => migration.from === version);
    if (!step) throw new MigrationError(`No migration from file format ${version}`);
    data = { ...step.migrate(data), schemaVersion: step.to };
    version = step.to;
  }
  return data;
}

/** Everything that happens to a project file after JSON.parse: migrate, then validate. */
export function parseProjectFile(raw: unknown): ValidationResult<Project> {
  let migrated: Record<string, unknown>;
  try {
    migrated = runMigrations(raw);
  } catch (error) {
    if (error instanceof MigrationError) {
      return { success: false, issues: [{ path: 'schemaVersion', message: error.message }] };
    }
    throw error;
  }
  return validateProject(migrated);
}
