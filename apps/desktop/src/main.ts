/**
 * The Windows app (M7b, ADR 0003): one window with the editor, and the local server running
 * right here in Electron's main process. A server process of its own would be one more
 * thing that could be left running after the app has closed; Remotion's own browser and
 * ffmpeg are separate processes anyway, and are ended before the app quits.
 */
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { DesktopSettingsPatch, ProjectImportResult } from '@travel-route-animator/core';
import { isRenderJobFinished } from '@travel-route-animator/core';
import { resolveServiceConfig } from '@travel-route-animator/server/config';
import { startServer, type RunningServer } from '@travel-route-animator/server/start';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  safeStorage,
  session,
  shell,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions,
} from 'electron';
import { ensureAirports } from './airports';
import { importProjects } from './importProjects';
import { appPaths, type AppPaths } from './paths';
import { createSettingsStore, type SettingsStore } from './settings';

const APP_NAME = 'Routen-Animator';
// Fixed, so the editor's origin and with it its remembered panel sizes stay the same between
// starts; `pnpm dev` uses 5174, so both can run at once. Taken: any free port.
const APP_PORT = 5175;
// How long quitting waits for Remotion to close its browser and ffmpeg after a cancel.
const STOP_RENDERS_MS = 15_000;
// The editor's dark background (index.css), so the window does not flash white at start.
const BACKGROUND = '#1d1d1d';

// Before anything asks for paths: the profile folder is named after the app.
app.setName(APP_NAME);
// For trying the app out or testing it without touching the real profile and Videos folder.
const testProfile = process.env.ROUTEN_ANIMATOR_PROFILE;
if (testProfile) {
  app.setPath('userData', join(testProfile, 'profile'));
  app.setPath('videos', join(testProfile, 'Videos'));
}

let paths: AppPaths;
let settings: SettingsStore;
let server: RunningServer | undefined;
let window: BrowserWindow | undefined;
let quitting = false;

const originOf = (url: string) => new URL(url).origin;
const isWebLink = (url: string) => /^https?:\/\//i.test(url);

function hasActiveRenders(): boolean {
  return server?.renderQueue.list().some((job) => !isRenderJobFinished(job.state)) ?? false;
}

let stopRendersConfirmed = false;

/** Asks once before a quit cancels a running render, from the window or from the menu. */
function mayStopRenders(): boolean {
  if (stopRendersConfirmed || !hasActiveRenders()) return true;
  const question = {
    type: 'warning' as const,
    buttons: ['Render abbrechen und beenden', 'Weiter rendern'],
    defaultId: 1,
    cancelId: 1,
    title: APP_NAME,
    message: 'Ein Video wird gerade gerendert.',
    detail: 'Beim Beenden wird es abgebrochen; eine halbe Datei bleibt nicht liegen.',
  };
  const choice = window
    ? dialog.showMessageBoxSync(window, question)
    : dialog.showMessageBoxSync(question);
  stopRendersConfirmed = choice === 0;
  return stopRendersConfirmed;
}

async function launchServer(port = APP_PORT): Promise<RunningServer> {
  const current = settings.effective();
  await mkdir(dirname(paths.logFile), { recursive: true });
  return startServer({
    dataDir: paths.dataDir,
    outputDir: current.outputDir,
    // The same settings the web version reads from .env.
    services: resolveServiceConfig({
      ORS_API_KEY: current.orsApiKey,
      SERVICE_CONTACT: current.serviceContact,
    }),
    render: {
      gl: current.renderGl,
      prepareOnStart: false,
      // Bundled while building the app: the app never bundles (Remotion's Electron guide).
      prebuiltServeUrl: paths.sceneBundleDir,
      ...(paths.browserExecutable && { browserExecutable: paths.browserExecutable }),
      ...(paths.binariesDirectory && { binariesDirectory: paths.binariesDirectory }),
    },
    listen: { host: '127.0.0.1', port },
    anyPortIfTaken: true,
    editorDir: paths.editorDir,
    revealFile: (path) => {
      shell.showItemInFolder(path);
      return true;
    },
    logger: { level: 'info', stream: createWriteStream(paths.logFile, { flags: 'a' }) },
  });
}

function createWindow(url: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: BACKGROUND,
    title: APP_NAME,
    autoHideMenuBar: false,
    webPreferences: {
      preload: join(import.meta.dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  win.once('ready-to-show', () => win.show());
  // The page's own title is the English project name; the window is the German app.
  win.on('page-title-updated', (event) => event.preventDefault());

  // The window shows our editor and nothing else. Links out (map credits, "Kartenfehler
  // melden") open in the user's browser.
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (isWebLink(target)) void shell.openExternal(target);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, target) => {
    if (server && originOf(target) === originOf(server.url)) return;
    event.preventDefault();
    if (isWebLink(target)) void shell.openExternal(target);
  });
  // The editor asks before leaving with unsaved changes (beforeunload). A browser shows its
  // own question; Electron would just refuse to close, so the app asks instead.
  win.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['Trotzdem schließen', 'Abbrechen'],
      defaultId: 1,
      cancelId: 1,
      title: APP_NAME,
      message: 'Es gibt noch ungespeicherte Änderungen.',
      detail: 'Sie werden gleich automatisch gespeichert. Jetzt schließen verwirft sie.',
    });
    if (choice === 0) event.preventDefault();
  });
  win.on('close', (event) => {
    if (!quitting && !mayStopRenders()) event.preventDefault();
  });

  void win.loadURL(url);
  return win;
}

/** Only our own editor may call into the main process. */
function fromEditor(event: IpcMainInvokeEvent): boolean {
  const frameUrl = event.senderFrame?.url;
  return (
    server !== undefined && frameUrl !== undefined && originOf(frameUrl) === originOf(server.url)
  );
}

async function restartServer(): Promise<void> {
  if (!server) return;
  const port = Number(new URL(server.url).port);
  await server.close();
  server = await launchServer(port);
  await window?.loadURL(server.url);
}

async function runImport(): Promise<ProjectImportResult | null> {
  if (!window) return null;
  const picked = await dialog.showOpenDialog(window, {
    title: 'Ordner mit Projekten wählen',
    // In the repo they live in data/; the installed app starts in the user's documents.
    defaultPath: app.isPackaged
      ? app.getPath('documents')
      : join(import.meta.dirname, '..', '..', '..', 'data'),
    properties: ['openDirectory'],
  });
  const source = picked.canceled ? undefined : picked.filePaths[0];
  if (!source) return null;
  const result = await importProjects(source, paths.dataDir);
  const lines = [
    ...result.imported.map((name) => `✓ ${name}`),
    ...result.skipped.map(({ name, reason }) => `– ${name}: ${reason}`),
  ];
  await dialog.showMessageBox(window, {
    type: result.imported.length > 0 ? 'info' : 'warning',
    title: APP_NAME,
    message:
      result.imported.length > 0
        ? `${result.imported.length} Projekt(e) übernommen.`
        : 'Keine neuen Projekte gefunden.',
    detail: lines.length > 0 ? lines.join('\n') : 'In diesem Ordner liegen keine Projekte.',
  });
  // The project list comes from the server; a reload shows the new ones.
  if (result.imported.length > 0) window.webContents.reload();
  return result;
}

/** On the very first start: bring in the projects made with the web version? */
async function offerImport(): Promise<void> {
  await settings.markImportOffered();
  if (!window) return;
  const { response } = await dialog.showMessageBox(window, {
    type: 'question',
    buttons: ['Ordner wählen …', 'Nicht jetzt'],
    defaultId: 0,
    cancelId: 1,
    title: APP_NAME,
    message: 'Bestehende Projekte übernehmen?',
    detail:
      'Wenn du schon mit der Web-Version gearbeitet hast, kopiert die App deine Projekte. ' +
      'Wähle dafür den Ordner „data“ im Repo. Die Originale bleiben, wo sie sind. ' +
      'Das geht auch später über Datei → Projekte importieren …',
  });
  if (response === 0) await runImport();
}

function buildMenu(): Menu {
  const openFolder = async (folder: string) => {
    await mkdir(folder, { recursive: true });
    await shell.openPath(folder);
  };
  // No "Bearbeiten" menu: its Ctrl+Z would take undo away from the editor's own history.
  // Copy and paste in text fields work without it.
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Datei',
      submenu: [
        {
          label: 'Einstellungen …',
          accelerator: 'CmdOrCtrl+,',
          click: () => window?.webContents.send('open-settings'),
        },
        { label: 'Projekte importieren …', click: () => void runImport() },
        { type: 'separator' },
        {
          label: 'Videoordner öffnen',
          click: () => void openFolder(settings.effective().outputDir),
        },
        { label: 'Datenordner öffnen', click: () => void openFolder(paths.dataDir) },
        { type: 'separator' },
        { role: 'quit', label: 'Beenden' },
      ],
    },
    {
      label: 'Ansicht',
      submenu: [
        { role: 'reload', label: 'Neu laden' },
        { role: 'togglefullscreen', label: 'Vollbild' },
        { type: 'separator' },
        { role: 'toggleDevTools', label: 'Entwicklerwerkzeuge' },
      ],
    },
    {
      label: 'Hilfe',
      submenu: [
        {
          label: `Über ${APP_NAME}`,
          click: () =>
            void dialog.showMessageBox({
              title: APP_NAME,
              message: `${APP_NAME} ${app.getVersion()}`,
              detail:
                `Electron ${process.versions.electron}, Chromium ${process.versions.chrome}, ` +
                `Node ${process.versions.node}.\n` +
                'Karten: OpenFreeMap © OpenMapTiles, Daten © OpenStreetMap-Mitwirkende. ' +
                'Routen: openrouteservice, FOSSGIS-Routing.',
            }),
        },
        { label: 'Log-Datei zeigen', click: () => shell.showItemInFolder(paths.logFile) },
      ],
    },
  ];
  return Menu.buildFromTemplate(template);
}

function registerIpc(): void {
  ipcMain.handle('settings:get', (event) => {
    if (!fromEditor(event)) throw new Error('Not allowed');
    return settings.forWindow();
  });
  ipcMain.handle('settings:update', async (event, patch: DesktopSettingsPatch) => {
    if (!fromEditor(event)) throw new Error('Not allowed');
    if (hasActiveRenders()) {
      throw new Error('Während ein Video rendert, lassen sich die Einstellungen nicht ändern.');
    }
    await settings.update(patch);
    // The server reads its keys and folders at start-up; a restart takes the new ones.
    await restartServer();
    return settings.forWindow();
  });
  ipcMain.handle(
    'dialog:chooseFolder',
    async (event, title: string, defaultPath: string | undefined) => {
      if (!fromEditor(event) || !window) throw new Error('Not allowed');
      const picked = await dialog.showOpenDialog(window, {
        title,
        ...(defaultPath && { defaultPath }),
        properties: ['openDirectory', 'createDirectory'],
      });
      return picked.canceled ? null : (picked.filePaths[0] ?? null);
    },
  );
  ipcMain.handle('projects:import', (event) => {
    if (!fromEditor(event)) throw new Error('Not allowed');
    return runImport();
  });
}

async function start(): Promise<void> {
  paths = appPaths({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    mainDir: import.meta.dirname,
    userData: app.getPath('userData'),
    videos: app.getPath('videos'),
  });
  settings = createSettingsStore({
    file: paths.settingsFile,
    // Windows' own encryption, bound to this user account (DPAPI).
    vault: {
      isAvailable: () => safeStorage.isEncryptionAvailable(),
      encrypt: (plain) => safeStorage.encryptString(plain),
      decrypt: (sealed) => safeStorage.decryptString(sealed),
    },
    defaultOutputDir: paths.defaultOutputDir,
    dataDir: paths.dataDir,
  });
  await settings.load();
  await ensureAirports(paths.airportsFile, paths.dataDir);

  // The editor needs nothing from the browser that asks for permission, except writing
  // to the clipboard ("Pfad kopieren").
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) =>
    callback(permission === 'clipboard-sanitized-write'),
  );
  registerIpc();
  Menu.setApplicationMenu(buildMenu());

  server = await launchServer();
  window = createWindow(server.url);
  window.on('closed', () => (window = undefined));
  if (!settings.importOffered()) {
    window.webContents.once('did-finish-load', () => void offerImport());
  }
}

// Before quitting: cancel running renders (Remotion then closes its browser and ffmpeg and
// removes the partial file) and close the server. Windows would not end those child
// processes on its own when the app goes.
app.on('before-quit', (event) => {
  if (quitting || !server) return;
  event.preventDefault();
  if (!mayStopRenders()) return;
  quitting = true;
  const running = server;
  void (async () => {
    try {
      await running.stopRenders(STOP_RENDERS_MS);
      await running.close();
    } finally {
      app.quit();
    }
  })();
});

app.on('window-all-closed', () => app.quit());

// One app at a time: a second start brings the open window to the front instead of starting
// a second server.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });
  app
    .whenReady()
    .then(start)
    .catch((error: unknown) => {
      dialog.showErrorBox(
        APP_NAME,
        `Die App konnte nicht starten:\n${error instanceof Error ? error.message : String(error)}`,
      );
      app.exit(1);
    });
}
