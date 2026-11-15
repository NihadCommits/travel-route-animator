// What the Windows app (apps/desktop, M7b) offers its window through the preload script.
// Types only: the editor checks `window.desktop` and shows the app's settings when it is
// there; in the browser version it is missing and everything else works the same.

/** The app's settings as the window sees them. The openrouteservice key never comes back. */
export interface DesktopSettings {
  orsApiKeySet: boolean;
  /** Satellite imagery (ADR 0010); like the ORS key, the window only learns whether there is one. */
  maptilerApiKeySet: boolean;
  serviceContact: string;
  /** Where videos go; defaultOutputDir unless changed. */
  outputDir: string;
  defaultOutputDir: string;
  /** Where the projects are; fixed in the app. */
  dataDir: string;
  /** Chromium's OpenGL backend for rendering (RENDER_GL in the web version). */
  renderGl: string;
  renderGlOptions: string[];
}

/**
 * A change from the settings dialog. A missing field stays as it is; null resets it
 * (removes the key, goes back to the default folder).
 */
export interface DesktopSettingsPatch {
  orsApiKey?: string | null;
  maptilerApiKey?: string | null;
  serviceContact?: string;
  outputDir?: string | null;
  renderGl?: string;
}

export interface ProjectImportResult {
  imported: string[];
  /** Name and reason, e.g. an id the app already has or a broken file. */
  skipped: { name: string; reason: string }[];
}

export interface DesktopBridge {
  getSettings: () => Promise<DesktopSettings>;
  /** Saves and restarts the local server with the new settings; refused while rendering. */
  updateSettings: (patch: DesktopSettingsPatch) => Promise<DesktopSettings>;
  /** The system's folder dialog; null if cancelled. */
  chooseFolder: (title: string, defaultPath?: string) => Promise<string | null>;
  /** Asks for a folder with projects and copies them into the app; null if cancelled. */
  importProjects: () => Promise<ProjectImportResult | null>;
  /** The app menu's "Einstellungen …"; returns the unsubscribe. */
  onOpenSettings: (listener: () => void) => () => void;
}
