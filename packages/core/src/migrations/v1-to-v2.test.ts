import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION } from '../model/project';
import { sampleProject } from '../testing/sampleProject';
import { parseProjectFile } from './migrations';
import { v1ToV2 } from './v1-to-v2';

/**
 * The sample project as file format 1 wrote it: `futureRoute` instead of `ahead`, and neither
 * vehicle icons nor assets (format 3).
 */
function versionOneFile(futureRoutes: string[]) {
  const { assets: _assets, ...current } = JSON.parse(JSON.stringify(sampleProject())) as {
    schemaVersion: number;
    assets?: unknown;
    groups: { etappen: { tracks: { style: Record<string, unknown> }[] }[] }[];
  };
  const project = { ...current, schemaVersion: 1 };
  const tracks = project.groups.flatMap((group) => group.etappen.flatMap((e) => e.tracks));
  tracks.forEach((track, i) => {
    const { ahead: _ahead, icon: _icon, ...style } = track.style;
    track.style = { ...style, futureRoute: futureRoutes[i % futureRoutes.length] };
  });
  return { project, tracks };
}

describe('migration 1 → 2', () => {
  it('turns "hidden" into an invisible and "ghost" into a faint route ahead', () => {
    const { project, tracks } = versionOneFile(['hidden', 'ghost']);
    tracks[1]!.style.lineDash = 'dotted';
    const result = parseProjectFile(project);
    if (!result.success) throw new Error(JSON.stringify(result.issues));
    const styles = result.data.groups
      .flatMap((g) => g.etappen.flatMap((e) => e.tracks))
      .map((track) => track.style);
    expect(result.data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(styles[0]!.ahead).toEqual({ opacity: 0, dash: 'solid' });
    // Format 1 drew the faint route in the line's own dash, so the look stays the same.
    expect(styles[1]!.ahead).toEqual({ opacity: 0.35, dash: 'dotted' });
    expect(styles[0]).not.toHaveProperty('futureRoute');
  });

  it('drops the option badges format 1 stored but never drew', () => {
    const { project, tracks } = versionOneFile(['hidden']);
    tracks[0]!.style.variantBadge = 'A';
    const result = parseProjectFile(project);
    if (!result.success) throw new Error(JSON.stringify(result.issues));
    expect(result.data.groups[0]!.etappen[0]!.tracks[0]!.style).not.toHaveProperty('variantBadge');
  });

  it('puts the new field where the old one was and leaves the input alone', () => {
    const { project, tracks } = versionOneFile(['ghost']);
    const before = JSON.stringify(project);
    const migrated = v1ToV2.migrate(project) as typeof project;
    const style = migrated.groups[0]!.etappen[0]!.tracks[0]!.style;
    expect(Object.keys(style)).toEqual(
      Object.keys(tracks[0]!.style).map((key) => (key === 'futureRoute' ? 'ahead' : key)),
    );
    expect(JSON.stringify(project)).toBe(before);
  });

  it('leaves files it does not understand for validation to report', () => {
    expect(v1ToV2.migrate({ name: 'no groups' })).toEqual({ name: 'no groups' });
    const odd = {
      groups: [{ etappen: [{ tracks: [{ style: { futureRoute: 'sometimes' } }, 7] }] }],
    };
    expect(v1ToV2.migrate(odd)).toEqual(odd);
    const { project } = versionOneFile(['sometimes']);
    expect(parseProjectFile(project).success).toBe(false);
  });
});
