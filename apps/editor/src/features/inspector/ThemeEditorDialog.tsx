import type { Theme, ThemeLayers, ThemeTokens } from '@travel-route-animator/core';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { de } from '@/i18n/de';
import { api } from '@/lib/api';
import { selectProject, useEditor } from '@/state/editorStore';
import { ColorField } from './fields/ColorField';
import { SelectField } from './fields/SelectField';
import { SliderField } from './fields/SliderField';
import { SwitchField } from './fields/SwitchField';
import { TextField } from './fields/TextField';
import { THEMES_QUERY_KEY } from './mapStyles';
import { optionsOf } from './parts';
import { ThemePreviewMap } from './ThemePreviewMap';

const texts = de.inspector.themeEditor;
const TOKENS = Object.keys(texts.tokens) as (keyof ThemeTokens)[];
const LAYERS = Object.keys(texts.layerNames) as (keyof ThemeLayers)[];

/**
 * Colours, layers and finish of a theme, with a live map beside them (ADR 0010). A built-in
 * theme is never changed: its copy is saved as an own theme. An own theme is saved in place.
 */
export function ThemeEditorDialog({
  theme,
  ownThemes,
  onClose,
  onSaved,
}: {
  theme: Theme;
  ownThemes: Readonly<Record<string, Theme>>;
  onClose: () => void;
  /** Called with the stored theme; the caller makes the style use it. */
  onSaved: (theme: Theme) => string | null;
}) {
  const project = useEditor(selectProject);
  const queryClient = useQueryClient();
  const isOwn = ownThemes[theme.id] !== undefined;
  const [draft, setDraft] = useState<Theme>(() =>
    isOwn
      ? theme
      : {
          ...theme,
          id: `theme-${crypto.randomUUID().slice(0, 8)}`,
          name: texts.copyName(theme.name),
        },
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const setToken = (token: keyof ThemeTokens, color: string) =>
    setDraft((d) => ({ ...d, tokens: { ...d.tokens, [token]: color } }));
  const setLayer = (layer: keyof ThemeLayers, on: boolean) =>
    setDraft((d) => ({ ...d, layers: { ...d.layers, [layer]: on } }));

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (caught) {
      setError(texts.failed(caught instanceof Error ? caught.message : String(caught)));
    } finally {
      setBusy(false);
    }
  };
  const save = () =>
    run(async () => {
      const saved = await api.saveTheme(draft);
      await queryClient.invalidateQueries({ queryKey: THEMES_QUERY_KEY });
      const problem = onSaved(saved);
      if (problem) setError(problem);
    });
  const remove = () =>
    run(async () => {
      await api.deleteTheme(draft.id);
      await queryClient.invalidateQueries({ queryKey: THEMES_QUERY_KEY });
      onClose();
    });

  // The first stop of the project shows the theme where the trip is; Central Europe else.
  const firstStop = project.groups
    .flatMap((g) => g.etappen.flatMap((e) => e.tracks.flatMap((t) => t.waypoints)))
    .at(0)?.lngLat;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{texts.title}</DialogTitle>
          <DialogDescription>{texts.description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-[1fr_1.2fr]">
          <div className="space-y-3">
            <TextField
              label={texts.name}
              value={draft.name}
              onCommit={(name) => {
                if (!name.trim()) return texts.nameRequired;
                setDraft((d) => ({ ...d, name: name.trim() }));
                return null;
              }}
            />
            <fieldset className="grid grid-cols-2 gap-2">
              <legend className="text-muted-foreground mb-1 text-xs">{texts.colors}</legend>
              {TOKENS.map((token) => (
                <ColorField
                  key={token}
                  label={texts.tokens[token]}
                  value={draft.tokens[token]}
                  onCommit={(color) => {
                    if (color) setToken(token, color.toLowerCase());
                    return null;
                  }}
                />
              ))}
            </fieldset>
            <fieldset className="space-y-1.5">
              <legend className="text-muted-foreground mb-1 text-xs">{texts.layers}</legend>
              {LAYERS.map((layer) => (
                <SwitchField
                  key={layer}
                  label={texts.layerNames[layer]}
                  checked={draft.layers[layer]}
                  onCommit={(on) => {
                    setLayer(layer, on);
                    return null;
                  }}
                />
              ))}
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="text-muted-foreground mb-1 text-xs">{texts.finish}</legend>
              <SelectField
                label={texts.texture}
                value={draft.extras.texture}
                options={optionsOf(['none', 'paper'] as const, texts.textures)}
                onCommit={(texture) => {
                  setDraft((d) => ({ ...d, extras: { ...d.extras, texture } }));
                  return null;
                }}
              />
              <SliderField
                label={texts.vignette}
                value={Math.round(draft.extras.vignette * 100)}
                min={0}
                max={100}
                step={5}
                format={(value) => `${value} %`}
                onCommit={(value) => {
                  setDraft((d) => ({ ...d, extras: { ...d.extras, vignette: value / 100 } }));
                  return null;
                }}
              />
            </fieldset>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">{texts.preview}</p>
            <ThemePreviewMap theme={draft} center={firstStop ?? [10, 50]} />
          </div>
        </div>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <DialogFooter className="gap-2">
          {isOwn && (
            <Button variant="outline" disabled={busy} onClick={() => void remove()}>
              {texts.delete}
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            {texts.cancel}
          </Button>
          <Button disabled={busy} onClick={() => void save()}>
            {isOwn ? texts.save : texts.saveNew}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
