import { describe, expect, it } from 'vitest';
import { sampleProject } from '../testing/sampleProject';
import { parseProjectFile } from './migrations';
import { v6ToV7 } from './v6-to-v7';

/** A format 6 file: stages have no pins yet. */
function format6File(): Record<string, unknown> {
  const project = JSON.parse(JSON.stringify(sampleProject())) as {
    groups: { etappen: Record<string, unknown>[] }[];
  };
  for (const group of project.groups) {
    for (const etappe of group.etappen) delete etappe.pins;
  }
  return { ...project, schemaVersion: 6 };
}

describe('migration 6 → 7', () => {
  it('gives every stage an empty list of pins', () => {
    const file = format6File();
    const before = JSON.stringify(file);
    const result = parseProjectFile(file);
    if (!result.success) throw new Error(JSON.stringify(result.issues));
    expect(result.data).toEqual(sampleProject());
    expect(JSON.stringify(file)).toBe(before);
  });

  it('leaves what it does not understand for validation', () => {
    expect(v6ToV7.migrate({ name: 'x' })).toEqual({ name: 'x' });
    expect(v6ToV7.migrate({ groups: [{ etappen: ['odd'] }] })).toEqual({
      groups: [{ etappen: ['odd'] }],
    });
  });
});
