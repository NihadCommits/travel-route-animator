import { describe, expect, it } from 'vitest';
import { sampleProject } from '../testing/sampleProject';
import { parseProjectFile } from './migrations';
import { v3ToV4 } from './v3-to-v4';

describe('migration 3 → 4', () => {
  it('opens a format 3 file without changes', () => {
    const file = { ...(JSON.parse(JSON.stringify(sampleProject())) as object), schemaVersion: 3 };
    const before = JSON.stringify(file);
    const result = parseProjectFile(file);
    if (!result.success) throw new Error(JSON.stringify(result.issues));
    expect(result.data).toEqual(sampleProject());
    expect(JSON.stringify(file)).toBe(before);
    expect(v3ToV4.migrate({ name: 'x' })).toEqual({ name: 'x' });
  });
});
