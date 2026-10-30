import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProject, type Project } from '@travel-route-animator/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { airportsFileIn, ensureAirports } from './airports';
import { importProjects } from './importProjects';
import { appPaths, COMPOSITOR_PACKAGE } from './paths';
import { createSettingsStore, SettingsError, type KeyVault } from './settings';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tra-desktop-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('appPaths', () => {
  const inputs = {
    resourcesPath: 'C:\\Programme\\Routen-Animator\\resources',
    mainDir: 'C:\\repo\\apps\\desktop\\dist',
    userData: 'C:\\Users\\n\\AppData\\Roaming\\Routen-Animator',
    videos: 'C:\\Users\\n\\Videos',
  };

  it('keeps projects in the profile and videos in the Videos folder', () => {
    const paths = appPaths({ ...inputs, isPackaged: true });
    expect(paths.dataDir).toBe(join(inputs.userData, 'data'));
    expect(paths.defaultOutputDir).toBe(join(inputs.videos, 'Routen-Animator'));
    expect(paths.settingsFile).toBe(join(inputs.userData, 'settings.json'));
  });

  it('runs Chrome and the compositor from outside the installed archive', () => {
    const paths = appPaths({ ...inputs, isPackaged: true });
    const unpacked = join(inputs.resourcesPath, 'app.asar.unpacked');
    expect(paths.editorDir).toBe(join(inputs.resourcesPath, 'editor'));
    expect(paths.browserExecutable?.startsWith(unpacked)).toBe(true);
    expect(paths.browserExecutable).toMatch(/chrome-headless-shell\.exe$/);
    expect(paths.binariesDirectory).toBe(join(unpacked, 'node_modules', COMPOSITOR_PACKAGE));
  });

  it('finds its resources next to main.mjs when started from the build', () => {
    const paths = appPaths({ ...inputs, isPackaged: false });
    expect(paths.sceneBundleDir).toBe(join(inputs.mainDir, 'resources', 'scene-bundle'));
    expect(paths.browserExecutable).toBeUndefined();
    expect(paths.binariesDirectory).toBeUndefined();
  });
});

describe('settings', () => {
  /** Stands in for Windows' encryption: reversible, but not plain text. */
  const vault: KeyVault = {
    isAvailable: () => true,
    encrypt: (plain) => Buffer.from([...plain].reverse().join(''), 'utf8'),
    decrypt: (sealed) => [...sealed.toString('utf8')].reverse().join(''),
  };
  const store = (overrides: Partial<KeyVault> = {}) =>
    createSettingsStore({
      file: join(dir, 'settings.json'),
      vault: { ...vault, ...overrides },
      defaultOutputDir: join(dir, 'Videos'),
      dataDir: join(dir, 'data'),
    });

  it('starts with the defaults and keeps the key encrypted on disk', async () => {
    const settings = store();
    await settings.load();
    expect(settings.effective()).toEqual({
      orsApiKey: undefined,
      serviceContact: '',
      outputDir: join(dir, 'Videos'),
      renderGl: 'angle',
    });

    await settings.update({ orsApiKey: ' geheim-123 ', serviceContact: 'github.com/n' });
    const file = await readFile(join(dir, 'settings.json'), 'utf8');
    expect(file).not.toContain('geheim-123');

    const again = store();
    await again.load();
    expect(again.effective().orsApiKey).toBe('geheim-123');
    // The window learns that there is a key, never the key itself.
    expect(again.forWindow()).toMatchObject({ orsApiKeySet: true, serviceContact: 'github.com/n' });
    expect(JSON.stringify(again.forWindow())).not.toContain('geheim');
  });

  it('removes the key and goes back to the default folder on null', async () => {
    const settings = store();
    await settings.update({ orsApiKey: 'k', outputDir: join(dir, 'anders') });
    expect(settings.effective().outputDir).toBe(join(dir, 'anders'));
    await settings.update({ orsApiKey: null, outputDir: null });
    expect(settings.effective()).toMatchObject({
      orsApiKey: undefined,
      outputDir: join(dir, 'Videos'),
    });
  });

  it('refuses an unknown OpenGL backend and a key Windows cannot encrypt', async () => {
    await expect(store().update({ renderGl: 'opengl' })).rejects.toBeInstanceOf(SettingsError);
    await expect(
      store({ isAvailable: () => false }).update({ orsApiKey: 'k' }),
    ).rejects.toBeInstanceOf(SettingsError);
  });

  it('forgets a key sealed elsewhere and a broken file instead of failing to start', async () => {
    await writeFile(join(dir, 'settings.json'), '{"orsApiKeySealed": "AAAA", "renderGl": 5');
    const broken = store();
    await broken.load();
    expect(broken.effective().renderGl).toBe('angle');

    await writeFile(join(dir, 'settings.json'), JSON.stringify({ orsApiKeySealed: 'AAAA' }));
    const foreign = store({
      decrypt: () => {
        throw new Error('sealed by another user');
      },
    });
    await foreign.load();
    expect(foreign.effective().orsApiKey).toBeUndefined();
  });

  it('remembers that the first start asked about importing', async () => {
    const settings = store();
    expect(settings.importOffered()).toBe(false);
    await settings.markImportOffered();
    const again = store();
    await again.load();
    expect(again.importOffered()).toBe(true);
  });
});

describe('importProjects', () => {
  async function writeProject(parent: string, folder: string, project: Project) {
    await mkdir(join(parent, folder), { recursive: true });
    await writeFile(join(parent, folder, 'project.json'), JSON.stringify(project));
  }

  it('copies the projects of a data folder and leaves the originals', async () => {
    const repoData = join(dir, 'repo-data');
    const portugal = createProject('Portugal 2026');
    await writeProject(join(repoData, 'projects'), 'portugal-2026', portugal);
    await writeProject(join(repoData, 'projects'), 'kaputt', { nope: true } as unknown as Project);

    const result = await importProjects(repoData, join(dir, 'app-data'));
    expect(result.imported).toEqual(['Portugal 2026']);
    expect(result.skipped).toEqual([
      { name: 'kaputt', reason: 'Die Projektdatei ist beschädigt.' },
    ]);
    expect(await readdir(join(dir, 'app-data', 'projects'))).toEqual(['portugal-2026']);
    expect(await readdir(join(repoData, 'projects'))).toHaveLength(2);
  });

  it('changes nothing when importing twice, and gives a new name to a taken folder', async () => {
    const source = join(dir, 'projects');
    const appData = join(dir, 'app-data');
    await writeProject(source, 'portugal-2026', createProject('Portugal 2026'));
    await importProjects(source, appData);
    expect((await importProjects(source, appData)).skipped).toEqual([
      { name: 'Portugal 2026', reason: 'Ist schon in der App.' },
    ]);

    // Another project with the same name: same slug, but a different id.
    await writeProject(join(dir, 'other'), 'p', createProject('Portugal 2026'));
    await importProjects(join(dir, 'other', 'p'), appData);
    expect((await readdir(join(appData, 'projects'))).sort()).toEqual([
      'portugal-2026',
      'portugal-2026-2',
    ]);
  });
});

describe('ensureAirports', () => {
  it('copies the shipped list when it is missing or different, and only then', async () => {
    const shipped = join(dir, 'airports.json');
    await writeFile(shipped, '[{"iata":"VIE"}]');
    const dataDir = join(dir, 'data');
    expect(await ensureAirports(shipped, dataDir)).toBe(true);
    expect(await ensureAirports(shipped, dataDir)).toBe(false);
    await writeFile(shipped, '[{"iata":"VIE"},{"iata":"OPO"}]');
    expect(await ensureAirports(shipped, dataDir)).toBe(true);
    expect(await readFile(airportsFileIn(dataDir), 'utf8')).toContain('OPO');
    expect(await ensureAirports(join(dir, 'missing.json'), dataDir)).toBe(false);
  });
});
