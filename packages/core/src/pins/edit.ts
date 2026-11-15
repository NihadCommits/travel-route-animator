import { editEtappe, type Added } from '../edit/operations';
import type { ImageAsset } from '../model/assets';
import type { Pin } from '../model/etappe';
import { defaultFactoryContext, type FactoryContext } from '../model/factories';
import type { Id } from '../model/primitives';
import type { Project } from '../model/project';

// Editing a stage's pins (ADR 0014). A pin lives in its stage; its photo, if any, is an asset
// of the project, added in the same step so one undo takes both back.

/** How long a new pin stays open, in seconds. */
export const DEFAULT_PIN_SEC = 3;

export type NewPin = Pick<Pin, 'kind' | 'lngLat' | 'title'> & Partial<Pick<Pin, 'trigger'>>;

/** Adds a pin to a stage, with its photo when it has one. */
export function addPin(
  project: Project,
  etappeId: Id,
  input: NewPin,
  photo?: ImageAsset,
  ctx: FactoryContext = defaultFactoryContext,
): Added {
  const known = photo ? project.assets.some((asset) => asset.id === photo.id) : true;
  const withAsset = known || !photo ? project : { ...project, assets: [...project.assets, photo] };
  const pin: Pin = {
    id: ctx.createId('pin'),
    kind: input.kind,
    lngLat: [...input.lngLat],
    title: input.title,
    ...(photo && { assetId: photo.id }),
    trigger: input.trigger ?? { mode: 'pass' },
    durationSec: DEFAULT_PIN_SEC,
  };
  return {
    project: editEtappe(withAsset, etappeId, (etappe) => ({
      ...etappe,
      pins: [...etappe.pins, pin],
    })),
    id: pin.id,
  };
}

export function editPin(
  project: Project,
  etappeId: Id,
  pinId: Id,
  update: (pin: Pin) => Pin,
): Project {
  return editEtappe(project, etappeId, (etappe) => ({
    ...etappe,
    pins: etappe.pins.map((pin) => (pin.id === pinId ? update(pin) : pin)),
  }));
}

/** Takes a pin away; its photo stays among the project's assets, like an unused icon. */
export function removePin(project: Project, etappeId: Id, pinId: Id): Project {
  return editEtappe(project, etappeId, (etappe) => ({
    ...etappe,
    pins: etappe.pins.filter((pin) => pin.id !== pinId),
  }));
}
