import type { DesktopBridge } from '@travel-route-animator/core';

declare global {
  interface Window {
    /** Set by the Windows app's preload script (M7b); missing in the browser. */
    desktop?: DesktopBridge;
  }
}

/** The Windows app's bridge, or undefined in the browser version. */
export function desktopBridge(): DesktopBridge | undefined {
  return window.desktop;
}

/** Electron prefixes errors from the main process; the user only needs the reason. */
export function bridgeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}
