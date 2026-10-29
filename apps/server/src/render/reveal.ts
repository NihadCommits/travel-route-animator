import { spawn } from 'node:child_process';

/** Shows a file in the system's file manager; false where the server cannot do that. */
export type RevealFile = (path: string) => boolean;

/**
 * Opens Windows Explorer with the video selected. The path always comes from a render job,
 * never from the browser, so nothing but our own output folder can be opened this way.
 */
export const revealInExplorer: RevealFile = (path) => {
  if (process.platform !== 'win32') return false;
  // Explorer wants /select,"<path>" as one argument; Node's own quoting would put the quotes
  // around the whole of it, which Explorer does not understand.
  const child = spawn('explorer.exe', [`/select,"${path}"`], {
    detached: true,
    stdio: 'ignore',
    windowsVerbatimArguments: true,
  });
  // Explorer ends with exit code 1 even when it worked; there is nothing to wait for.
  child.on('error', () => undefined);
  child.unref();
  return true;
};
