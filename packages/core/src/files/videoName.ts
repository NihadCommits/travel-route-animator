import type { OutputSettings } from '../model/output';
import { slugify } from './slug';

// Windows refuses these names for files too, whatever the extension or case.
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
// Not allowed in Windows file names; the slash and backslash would also leave the folder.
const NOT_IN_FILE_NAMES = /[<>:"/\\|?*]/g;

export const MAX_VIDEO_NAME_LENGTH = 100;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * "lissabon-algarve_16x9_1080p_20261029-1530": the stage, its format and the local time, so
 * that several versions of one stage can be told apart in the folder.
 */
export function suggestVideoName(
  etappeName: string,
  output: Pick<OutputSettings, 'aspect' | 'resolution'>,
  at: Date,
): string {
  const day = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}`;
  const time = `${pad(at.getHours())}${pad(at.getMinutes())}`;
  return `${slugify(etappeName)}_${output.aspect.replace(':', 'x')}_${output.resolution}_${day}-${time}`;
}

/**
 * A name from the render dialog as a file name without extension, or null if nothing usable
 * is left. The server checks it again: the browser never decides where a file goes.
 */
export function cleanVideoName(name: string): string | null {
  const printable = [...name].map((char) => (char.charCodeAt(0) < 32 ? '-' : char)).join('');
  const cleaned = printable
    .replace(NOT_IN_FILE_NAMES, '-')
    .trim()
    .replace(/\.(mp4|mov)$/i, '')
    // Reserved for the file being rendered (see renderEtappe), which may be cleaned up.
    .replace(/\.partial$/i, '')
    .slice(0, MAX_VIDEO_NAME_LENGTH)
    // Windows drops trailing dots and spaces; a leading dot would hide the file elsewhere.
    .replace(/^[.\s]+|[.\s]+$/g, '');
  if (cleaned === '') return null;
  return WINDOWS_RESERVED.test(cleaned) ? `${cleaned}-video` : cleaned;
}
