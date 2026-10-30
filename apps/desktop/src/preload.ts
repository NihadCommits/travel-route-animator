// The only way from the editor into the main process: a few named calls through Electron's
// contextBridge. The page itself has no Node, no file system and no ipcRenderer.
import type { DesktopBridge } from '@travel-route-animator/core';
import { contextBridge, ipcRenderer } from 'electron';

const bridge: DesktopBridge = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  chooseFolder: (title, defaultPath) =>
    ipcRenderer.invoke('dialog:chooseFolder', title, defaultPath),
  importProjects: () => ipcRenderer.invoke('projects:import'),
  onOpenSettings(listener) {
    const handler = () => listener();
    ipcRenderer.on('open-settings', handler);
    return () => ipcRenderer.removeListener('open-settings', handler);
  },
};

contextBridge.exposeInMainWorld('desktop', bridge);
