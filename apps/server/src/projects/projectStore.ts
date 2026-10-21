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

/** The project exists on disk, but its file is broken (hand-edited, older app, …). */
export class ProjectFileInvalidError extends Error {
  override name = 'ProjectFileInvalidError';
  constructor(
    readonly id: string,
    /** Relative to the data folder, e.g. projects/portugal-2026/project.json */
    readonly file: string,
    readonly issues: ValidationIssue[],
  ) {
    super(`Project "${id}" cannot be opened: ${file} is not a valid project file`);
  }
}

interface StoredProject {
  slug: string;
  project: Project;
}

interface BrokenProjectFile {
  slug: string;
  /** Known when it can still be read from the broken file. */
  id: string | undefined;
  file: string;
  issues: ValidationIssue[];
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

  async function scan(): Promise<{ valid: StoredProject[]; broken: BrokenProjectFile[] }> {
    await mkdir(projectsDir, { recursive: true });
    const entries = await readdir(projectsDir, { withFileTypes: true });
    const valid: StoredProject[] = [];
    const broken: BrokenProjectFile[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const slug = entry.name;
      const file = `projects/${slug}/${PROJECT_FILE}`;
      let text: string;
      try {
        text = await readFile(join(projectsDir, slug, PROJECT_FILE), 'utf8');
      } catch (error) {
        if (!isNotFound(error)) warn(`Cannot read ${file}: ${String(error)}`);
        continue;
      }
      const checked = checkProjectFile(text);
      if (checked.success) {
        valid.push({ slug, project: checked.data });
      } else {
        broken.push({ slug, id: checked.id, file, issues: checked.issues });
        warn(`Skipping ${file}, it is not a valid project:\n${describeIssues(checked.issues)}`);
      }
    }
    return { valid, broken };
  }

  /** The valid project with this ID; a broken file with this ID is reported with its problems. */
  async function findOrThrow(id: string): Promise<StoredProject> {
    const { valid, broken } = await scan();
    const found = valid.find(({ project }) => project.id === id);
    if (found) return found;
    const brokenFile = broken.find((file) => file.id === id);
    if (brokenFile) throw new ProjectFileInvalidError(id, brokenFile.file, brokenFile.issues);
    throw new ProjectNotFoundError(id);
  }

  async function write(slug: string, project: Project): Promise<void> {
    const dir = join(projectsDir, slug);
    await mkdir(dir, { recursive: true });
    await writeFileAtomic(join(dir, PROJECT_FILE), `${JSON.stringify(project, null, 2)}\n`);
  }

  return {
    async list(): Promise<ProjectSummary[]> {
      const { valid } = await scan();
      return valid
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

    /** Also works for a broken file, so it can be cleared away without touching the folder by hand. */
    remove(id: string): Promise<void> {
      return exclusive(async () => {
        const { valid, broken } = await scan();
        const slug =
          valid.find(({ project }) => project.id === id)?.slug ??
          broken.find((file) => file.id === id)?.slug;
        if (slug === undefined) throw new ProjectNotFoundError(id);
        await mkdir(trashDir, { recursive: true });
        const stamp = now().toISOString().replace(/[:.]/g, '-');
        await rename(join(projectsDir, slug), join(trashDir, `${slug}_${stamp}`));
      });
    },
  };
}

export type ProjectStore = ReturnType<typeof createProjectStore>;

type CheckedFile =
  | { success: true; data: Project }
  | { success: false; id: string | undefined; issues: ValidationIssue[] };

/** Parses, migrates and validates a project file; for a broken file it still tries to find its ID. */
function checkProjectFile(text: string): CheckedFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      id: findIdInText(text),
      issues: [{ path: '', message: `Not valid JSON: ${reason}` }],
    };
  }
  const result = parseProjectFile(raw);
  if (result.success) return result;
  return { success: false, id: readId(raw) ?? findIdInText(text), issues: result.issues };
}

function readId(raw: unknown): string | undefined {
  if (typeof raw !== 'object' || raw === null || !('id' in raw)) return undefined;
  return typeof raw.id === 'string' ? raw.id : undefined;
}

// A file with a syntax error cannot be parsed, but its project ID is usually still readable:
// the server writes "id" right after "schemaVersion", so the first "id" in the text is the
// project's. Only used to say which project is broken, never to load anything.
function findIdInText(text: string): string | undefined {
  return /"id"\s*:\s*"([^"\\]+)"/.exec(text)?.[1];
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
