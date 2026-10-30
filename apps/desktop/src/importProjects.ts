import { access, cp, readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
  parseProjectFile,
  slugify,
  uniqueSlug,
  type ProjectImportResult,
} from '@travel-route-animator/core';

const PROJECT_FILE = 'project.json';

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * The project folders in what the user picked: the repo's data/ folder, its projects/
 * folder, or a single project folder. Anything else holds no projects.
 */
async function projectFolders(source: string): Promise<string[]> {
  if (await exists(join(source, PROJECT_FILE))) return [source];
  const projectsDir = (await exists(join(source, 'projects'))) ? join(source, 'projects') : source;
  const entries = await readdir(projectsDir, { withFileTypes: true });
  const folders: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory() && (await exists(join(projectsDir, entry.name, PROJECT_FILE)))) {
      folders.push(join(projectsDir, entry.name));
    }
  }
  return folders;
}

async function projectIdsIn(projectsDir: string): Promise<Set<string>> {
  const ids = new Set<string>();
  if (!(await exists(projectsDir))) return ids;
  for (const entry of await readdir(projectsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      const raw: unknown = JSON.parse(
        await readFile(join(projectsDir, entry.name, PROJECT_FILE), 'utf8'),
      );
      if (typeof raw === 'object' && raw !== null && 'id' in raw && typeof raw.id === 'string') {
        ids.add(raw.id);
      }
    } catch {
      // Not a project the app could open anyway.
    }
  }
  return ids;
}

/**
 * Copies projects into the app's data folder. The originals stay where they are, and a
 * project the app already has (same id) is left out, so importing twice changes nothing.
 * Each copy gets a folder name that is free, after its project name as the server does it.
 */
export async function importProjects(
  source: string,
  dataDir: string,
): Promise<ProjectImportResult> {
  const targetDir = join(dataDir, 'projects');
  const knownIds = await projectIdsIn(targetDir);
  const takenSlugs = new Set(
    (await exists(targetDir)) ? await readdir(targetDir) : ([] as string[]),
  );
  const result: ProjectImportResult = { imported: [], skipped: [] };

  for (const folder of await projectFolders(source)) {
    const name = basename(folder);
    let parsed;
    try {
      parsed = parseProjectFile(JSON.parse(await readFile(join(folder, PROJECT_FILE), 'utf8')));
    } catch {
      result.skipped.push({ name, reason: 'Die Projektdatei ist kein gültiges JSON.' });
      continue;
    }
    if (!parsed.success) {
      result.skipped.push({ name, reason: 'Die Projektdatei ist beschädigt.' });
      continue;
    }
    const project = parsed.data;
    if (knownIds.has(project.id)) {
      result.skipped.push({ name: project.name, reason: 'Ist schon in der App.' });
      continue;
    }
    const slug = uniqueSlug(slugify(project.name), takenSlugs);
    // The whole folder, so files that belong to the project (e.g. icons from M8) come along.
    await cp(folder, join(targetDir, slug), { recursive: true });
    takenSlugs.add(slug);
    knownIds.add(project.id);
    result.imported.push(project.name);
  }
  return result;
}
