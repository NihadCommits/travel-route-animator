import { mkdir, readdir, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import {
  createProject,
  defaultFactoryContext,
  describeIssues,
  parseProjectFile,
  validateProject,
  type Project,
  type ValidationIssue,
} from '@travel-route-animator/core';
import { writeFileAtomic } from '../fs/writeFileAtomic';
import { slugify, uniqueSlug } from './slug';

export interface ProjectSummary {
  id: string;
  name: string;
  slug: string;
  updatedAt: string;
}

export class ProjectNotFoundError extends Error {
  override name = 'ProjectNotFoundError';
  constructor(id: string) {
    super(`Project "${id}" does not exist`);
  }
}

export class ProjectValidationError extends Error {
  override name = 'ProjectValidationError';
  constructor(readonly issues: ValidationIssue[]) {
    super(describeIssues(issues));
  }
}

export interface ProjectStoreOptions {
  dataDir: string;
  now?: () => Date;
  warn?: (message: string) => void;
}

const PROJECT_FILE = 'project.json';

/**
 * Projects as files: data/projects/<slug>/project.json. The slug comes from the name at
 * creation and never changes, so paths stay stable when a project is renamed. Deleted
 * projects move to data/.trash/ and can be restored by hand.
 */
export function createProjectStore({
  dataDir,
  now = () => new Date(),
  warn = (message) => console.warn(message),
}: ProjectStoreOptions) {
  const projectsDir = join(dataDir, 'projects');
  const trashDir = join(dataDir, '.trash');

  // Writes run one after another. Each file write is atomic anyway; this keeps two requests
  // from interleaving read-check-write steps (e.g. picking the same slug twice).
  let queue: Promise<unknown> = Promise.resolve();
  function exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task);
    queue = run.catch(() => undefined);
    return run;
  }

  async function readAll(): Promise<{ slug: string; project: Project }[]> {
    await mkdir(projectsDir, { recursive: true });
    const entries = await readdir(projectsDir, { withFileTypes: true });
    const found: { slug: string; project: Project }[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const file = join(projectsDir, entry.name, PROJECT_FILE);
      let raw: unknown;
      try {
        raw = JSON.parse(await readFile(file, 'utf8'));
      } catch (error) {
        if (!isNotFound(error)) warn(`Skipping ${file}: ${String(error)}`);
        continue;
      }
      const result = parseProjectFile(raw);
      if (result.success) {
        found.push({ slug: entry.name, project: result.data });
      } else {
        warn(`Skipping ${file}, it is not a valid project:\n${describeIssues(result.issues)}`);
      }
    }
    return found;
  }

  async function findOrThrow(id: string) {
    const entry = (await readAll()).find(({ project }) => project.id === id);
    if (!entry) throw new ProjectNotFoundError(id);
    return entry;
  }

  async function write(slug: string, project: Project): Promise<void> {
    const dir = join(projectsDir, slug);
    await mkdir(dir, { recursive: true });
    await writeFileAtomic(join(dir, PROJECT_FILE), `${JSON.stringify(project, null, 2)}\n`);
  }

  return {
    async list(): Promise<ProjectSummary[]> {
      const all = await readAll();
      return all
        .map(({ slug, project }) => ({
          id: project.id,
          name: project.name,
          slug,
          updatedAt: project.updatedAt,
        }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async get(id: string): Promise<Project> {
      return (await findOrThrow(id)).project;
    },

    create(name: string): Promise<Project> {
      return exclusive(async () => {
        const project = createProject(name, {
          ...defaultFactoryContext,
          now: () => now().toISOString(),
        });
        await mkdir(projectsDir, { recursive: true });
        const taken = new Set((await readdir(projectsDir)).map((entry) => entry.toLowerCase()));
        await write(uniqueSlug(slugify(name), taken), project);
        return project;
      });
    },

    update(id: string, input: unknown): Promise<Project> {
      return exclusive(async () => {
        const result = validateProject(input);
        if (!result.success) throw new ProjectValidationError(result.issues);
        if (result.data.id !== id) {
          throw new ProjectValidationError([
            {
              path: 'id',
              message: `Project ID "${result.data.id}" does not match the URL (${id})`,
            },
          ]);
        }
        const { slug, project: stored } = await findOrThrow(id);
        const project: Project = {
          ...result.data,
          // The server owns these two: clients cannot rewrite history or fake freshness.
          createdAt: stored.createdAt,
          updatedAt: now().toISOString(),
        };
        await write(slug, project);
        return project;
      });
    },

    remove(id: string): Promise<void> {
      return exclusive(async () => {
        const { slug } = await findOrThrow(id);
        await mkdir(trashDir, { recursive: true });
        const stamp = now().toISOString().replace(/[:.]/g, '-');
        await rename(join(projectsDir, slug), join(trashDir, `${slug}_${stamp}`));
      });
    },
  };
}

export type ProjectStore = ReturnType<typeof createProjectStore>;

function isNotFound(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
