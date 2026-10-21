import { describe, expect, it } from 'vitest';
import { sampleProject } from '../testing/sampleProject';
import {
  MIGRATIONS,
  MigrationError,
  parseProjectFile,
  runMigrations,
  type Migration,
} from './migrations';

// Example migrations that only exist in this test: v1 renames "title" to "name",
// v2 adds a "tags" list. They show how a real migration chain is meant to work.
const EXAMPLE_MIGRATIONS: Migration[] = [
  {
    from: 1,
    to: 2,
    migrate: ({ title, ...rest }) => ({ ...rest, name: title }),
  },
  {
    from: 2,
    to: 3,
    migrate: (data) => ({ ...data, tags: [] }),
  },
];

describe('runMigrations', () => {
  it('applies every step up to the target version', () => {
    const oldFile = { schemaVersion: 1, title: 'Portugal 2026' };
    expect(runMigrations(oldFile, EXAMPLE_MIGRATIONS, 3)).toEqual({
      schemaVersion: 3,
      name: 'Portugal 2026',
      tags: [],
    });
  });

  it('starts at the version the file has', () => {
    const v2File = { schemaVersion: 2, name: 'Trip' };
    expect(runMigrations(v2File, EXAMPLE_MIGRATIONS, 3)).toEqual({
      schemaVersion: 3,
      name: 'Trip',
      tags: [],
    });
  });

  it('does not touch the input object', () => {
    const oldFile = { schemaVersion: 1, title: 'Trip' };
    runMigrations(oldFile, EXAMPLE_MIGRATIONS, 3);
    expect(oldFile).toEqual({ schemaVersion: 1, title: 'Trip' });
  });

  it('leaves a current file as it is', () => {
    const current = { schemaVersion: 3, name: 'Trip', tags: ['x'] };
    expect(runMigrations(current, EXAMPLE_MIGRATIONS, 3)).toBe(current);
  });

  it('refuses files from a newer app version', () => {
    expect(() => runMigrations({ schemaVersion: 4 }, EXAMPLE_MIGRATIONS, 3)).toThrow(
      /file format 4, but this app only understands up to 3/,
    );
  });

  it('fails when a step in the chain is missing', () => {
    const gap = [EXAMPLE_MIGRATIONS[1]!];
    expect(() => runMigrations({ schemaVersion: 1 }, gap, 3)).toThrow(
      'No migration from file format 1',
    );
  });

  it('rejects files without a usable schemaVersion', () => {
    expect(() => runMigrations({ name: 'x' })).toThrow(MigrationError);
    expect(() => runMigrations({ schemaVersion: '1' })).toThrow(/positive integer, got "1"/);
    expect(() => runMigrations({ schemaVersion: 0 })).toThrow(MigrationError);
    expect(() => runMigrations([1, 2])).toThrow('A project file must contain a JSON object');
    expect(() => runMigrations(null)).toThrow(MigrationError);
  });

  it('has no real migrations yet, because version 1 is the first file format', () => {
    expect(MIGRATIONS).toEqual([]);
  });
});

describe('parseProjectFile', () => {
  it('migrates and validates a project file', () => {
    const result = parseProjectFile(JSON.parse(JSON.stringify(sampleProject())));
    expect(result.success).toBe(true);
  });

  it('reports a file from a newer app as an issue instead of throwing', () => {
    const result = parseProjectFile({ ...sampleProject(), schemaVersion: 7 });
    expect(result).toEqual({
      success: false,
      issues: [
        { path: 'schemaVersion', message: expect.stringContaining('file format 7') as string },
      ],
    });
  });

  it('reports validation problems after migrating', () => {
    const project = sampleProject();
    project.name = '';
    const result = parseProjectFile(project);
    expect(result.success).toBe(false);
  });
});
