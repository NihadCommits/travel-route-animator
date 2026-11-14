import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { LngLat } from '../geo/lngLat';
import { canonicalJson } from '../routing/canonicalJson';

/** SHA-256 over an imported line: a new import (or the same reversed) is a new route. */
export function lineFingerprint(line: readonly LngLat[]): string {
  return bytesToHex(sha256(utf8ToBytes(canonicalJson(line))));
}
