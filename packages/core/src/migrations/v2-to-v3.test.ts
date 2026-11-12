import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION } from '../model/project';
import { sampleProject } from '../testing/sampleProject';
import { parseProjectFile } from './migrations';
import { v2ToV3 } from './v2-to-v3';

type FileTrack = { style: Record<string, unknown> };

/** The sample project as file format 2 wrote it: no vehicle icons, no assets. */
function versionTwoFile() {
  const { assets: _assets, ...current } = JSON.parse(JSON.stringify(sampleProject())) as {
    schemaVersion: number;
    assets?: unknown;
    groups: { etappen: { tracks: FileTrack[] }[] }[];
  };
  const project = { ...current, schemaVersion: 2 };
  const tracks = project.groups.flatMap((group) => group.etappen.flatMap((e) => e.tracks));
  for (const track of tracks) {
    const { icon: _icon, ...style } = track.style;
    track.style = style;
  }
  return { project, tracks };
}

describe('migration 2 → 3', () => {
  it('gives every vehicle its standard icon and the project an empty list of assets', () => {
    const { project, tracks } = versionTwoFile();
    expect(tracks.length).toBeGreaterThan(1);
    const result = parseProjectFile(project);
    if (!result.success) throw new Error(JSON.stringify(result.issues));
    expect(result.data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.data.assets).toEqual([]);
    const icons = result.data.groups.flatMap((g) =>
      g.etappen.flatMap((e) => e.tracks.map((track) => track.style.icon)),
    );
    expect(icons).toHaveLength(tracks.length);
    for (const icon of icons) expect(icon).toEqual({ kind: 'catalog' });
  });

  it('adds the icon last and leaves the input alone', () => {
    const { project } = versionTwoFile();
    const before = JSON.stringify(project);
    const migrated = v2ToV3.migrate(project) as typeof project;
    const style = migrated.groups[0]!.etappen[0]!.tracks[0]!.style;
    expect(Object.keys(style).at(-1)).toBe('icon');
    expect(JSON.stringify(project)).toBe(before);
  });

  it('leaves what it does not understand for validation to report', () => {
    expect(v2ToV3.migrate({ name: 'no groups' })).toEqual({ name: 'no groups', assets: [] });
    const odd = {
      groups: [{ etappen: [{ tracks: [{ style: 'blue' }, { style: { icon: 'car' } }, 7] }] }],
      assets: 'none',
    };
    expect(v2ToV3.migrate(odd)).toEqual(odd);
    const { project } = versionTwoFile();
    expect(parseProjectFile({ ...project, assets: 'none' }).success).toBe(false);
  });
});
