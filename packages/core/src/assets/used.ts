import type { Asset } from '../model/assets';
import type { Project } from '../model/project';

/**
 * The images a stage draws: its vehicles' own icons and its photo pins (ADR 0014). What a
 * render of it has to be given.
 */
export function assetsOfEtappe(project: Project, etappeId: string): Asset[] {
  const etappe = project.groups
    .flatMap((group) => group.etappen)
    .find((candidate) => candidate.id === etappeId);
  const used = new Set([
    ...(etappe?.tracks ?? []).flatMap(({ style: { icon } }) =>
      icon.kind === 'image' ? [icon.assetId] : [],
    ),
    ...(etappe?.pins ?? []).flatMap((pin) => (pin.assetId ? [pin.assetId] : [])),
  ]);
  return project.assets.filter((asset) => used.has(asset.id));
}
