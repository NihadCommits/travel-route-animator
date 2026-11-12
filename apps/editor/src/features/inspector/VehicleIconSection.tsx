import {
  editTrack,
  IMAGE_LIMITS,
  setImageIcon,
  type ImageAsset,
  type Track,
  type VehicleIcon,
} from '@travel-route-animator/core';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { de } from '@/i18n/de';
import { translateImageProblem } from '@/i18n/issues';
import { api, ApiError, assetUrl } from '@/lib/api';
import { selectProject, useEditor } from '@/state/editorStore';
import { SelectField } from './fields/SelectField';
import { SwitchField } from './fields/SwitchField';
import { optionsOf, Section } from './parts';
import type { Edit } from './useEdit';

const KINDS = ['catalog', 'image', 'none'] as const satisfies readonly VehicleIcon['kind'][];
const texts = de.inspector.track.icon;

function uploadError(error: unknown): string {
  if (error instanceof ApiError && error.body?.problem) {
    return translateImageProblem(error.body.problem, error.body.values);
  }
  return texts.uploadFailed(error instanceof Error ? error.message : String(error));
}

/**
 * What stands for the vehicle (ADR 0009): its type's icon, an own image or nothing. An image is
 * uploaded first and then added to the project together with its use, one step to undo; until
 * a first image is there, the vehicle keeps its standard icon.
 */
export function VehicleIconSection({ track, edit }: { track: Track; edit: Edit }) {
  const project = useEditor(selectProject);
  const { icon } = track.style;
  const images = project.assets.filter((asset) => asset.kind === 'image');
  // "Eigenes Bild" chosen, but no image picked yet: the form waits for a file.
  const [waitingForImage, setWaitingForImage] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const kind = icon.kind === 'image' || waitingForImage ? 'image' : icon.kind;
  const current = icon.kind === 'image' ? images.find((a) => a.id === icon.assetId) : undefined;

  const setIcon = (next: VehicleIcon) =>
    edit('style.icon', (p) =>
      editTrack(p, track.id, (t) => ({ ...t, style: { ...t.style, icon: next } })),
    );
  const pickImage = (asset: ImageAsset) => {
    setWaitingForImage(false);
    return edit('style.icon', (p) => setImageIcon(p, track.id, asset));
  };

  const chooseKind = (next: VehicleIcon['kind']) => {
    setError(null);
    if (next !== 'image') {
      setWaitingForImage(false);
      return setIcon({ kind: next });
    }
    if (icon.kind === 'image') return null;
    // The image used last is the likeliest choice; without any, the file picker opens.
    const last = images.at(-1);
    if (last) return pickImage(last);
    setWaitingForImage(true);
    fileInput.current?.click();
    return null;
  };

  const upload = async (file: File) => {
    setError(null);
    // Refused here already, without sending megabytes the server would refuse too.
    if (file.size > IMAGE_LIMITS.bytes) {
      setError(translateImageProblem('image.tooLarge', { limit: IMAGE_LIMITS.bytes }));
      return;
    }
    setUploading(true);
    try {
      const asset = await api.uploadImage(project.id, file, file.name);
      setError(pickImage(asset));
    } catch (caught) {
      setError(uploadError(caught));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Section title={texts.title}>
      <SelectField
        label={texts.kind}
        value={kind}
        options={optionsOf(KINDS, texts.kinds)}
        hint={kind === 'catalog' ? texts.catalogHint : kind === 'none' ? texts.noneHint : undefined}
        onCommit={chooseKind}
      />
      {kind === 'image' && (
        <>
          {images.length > 0 && (
            <SelectField
              label={texts.image}
              value={current?.id ?? ''}
              options={[
                ...(current ? [] : [{ value: '', label: '–', disabled: true }]),
                ...images.map((asset) => ({ value: asset.id, label: asset.name })),
              ]}
              onCommit={(id) => {
                const asset = images.find((candidate) => candidate.id === id);
                return asset ? pickImage(asset) : null;
              }}
            />
          )}
          {current ? (
            <figure className="flex items-center gap-3">
              <img
                src={assetUrl(project.id, current)}
                alt={current.name}
                className="bg-muted size-14 rounded object-contain p-1"
              />
              <figcaption className="text-muted-foreground min-w-0 text-xs">
                <span className="text-foreground block truncate">{current.name}</span>
                {texts.size(current.widthPx, current.heightPx, current.frameCount)}
              </figcaption>
            </figure>
          ) : (
            <p className="text-muted-foreground text-xs">{texts.noImageYet}</p>
          )}
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
          >
            {uploading ? texts.uploading : texts.add}
          </Button>
          {error && (
            <p role="alert" className="text-destructive text-xs">
              {error}
            </p>
          )}
          <SwitchField
            label={texts.rotates}
            checked={icon.kind === 'image' && icon.rotates}
            disabled={icon.kind !== 'image'}
            onCommit={(rotates) => (icon.kind === 'image' ? setIcon({ ...icon, rotates }) : null)}
          />
          <p className="text-muted-foreground text-xs">{texts.rotatesHint}</p>
          <p className="text-muted-foreground text-xs">{texts.rules}</p>
        </>
      )}
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/gif"
        className="hidden"
        aria-label={texts.add}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // The same file chosen twice in a row should upload twice, too.
          event.target.value = '';
          if (file) void upload(file);
        }}
      />
    </Section>
  );
}
