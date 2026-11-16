import {
  BUILT_IN_OVERLAY_STYLE_IDS,
  editEtappe,
  editGroup,
  OVERLAY_FONTS,
  OverlayBackgroundSchema,
  overlayTokensOf,
  UnitsSchema,
  type OverlayStyle,
  type OverlayStyleRef,
  type OverlayStyleTokens,
  type Project,
} from '@travel-route-animator/core';
import { boxStyleOf, useOverlayFonts } from '@travel-route-animator/scene';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ColorField } from '@/features/inspector/fields/ColorField';
import { SelectField } from '@/features/inspector/fields/SelectField';
import { SliderField } from '@/features/inspector/fields/SliderField';
import { SwitchField } from '@/features/inspector/fields/SwitchField';
import type { StyleLevel } from '@/features/inspector/MapStyleSection';
import { optionsOf, Section } from '@/features/inspector/parts';
import type { Edit } from '@/features/inspector/useEdit';
import { de } from '@/i18n/de';
import { api } from '@/lib/api';
import { OVERLAY_STYLES_QUERY_KEY, useOwnOverlayStyles } from './ownStyles';

// The look of the overlay blocks (M17), chosen like the map style: the project sets one, a
// group or a stage may choose its own, and each level can change single parts of it.

const texts = de.overlays;

/** This level's own style and the one it would inherit; the project's own is always set. */
function stylesAt(project: Project, level: StyleLevel) {
  const projectStyle = project.defaults.overlayStyle;
  switch (level.kind) {
    case 'project':
      return { own: projectStyle, inherited: undefined };
    case 'group':
      return {
        own: level.group.overlayStyle,
        inherited: { style: projectStyle, note: de.inspector.mapStyle.fromProject },
      };
    case 'etappe':
      return {
        own: level.etappe.overlays.style,
        inherited: level.group.overlayStyle
          ? {
              style: level.group.overlayStyle,
              note: de.inspector.mapStyle.fromGroup(level.group.name),
            }
          : { style: projectStyle, note: de.inspector.mapStyle.fromProject },
      };
  }
}

function writeStyle(
  project: Project,
  level: StyleLevel,
  style: OverlayStyleRef | undefined,
): Project {
  switch (level.kind) {
    case 'project':
      return style
        ? { ...project, defaults: { ...project.defaults, overlayStyle: style } }
        : project;
    case 'group':
      return editGroup(project, level.group.id, ({ overlayStyle: _old, ...group }) =>
        style ? { ...group, overlayStyle: style } : group,
      );
    case 'etappe':
      return editEtappe(project, level.etappe.id, (etappe) => {
        const { style: _old, ...overlays } = etappe.overlays;
        return { ...etappe, overlays: style ? { ...overlays, style } : overlays };
      });
  }
}

/** The name of a style for the list: built-in ones by their German name, own ones by theirs. */
export function overlayStyleName(styleId: string, ownStyles: readonly OverlayStyle[]): string {
  return texts.styles[styleId] ?? ownStyles.find((style) => style.id === styleId)?.name ?? styleId;
}

/** A value in the chosen style, so the choice can be judged without playing the preview. */
function StyleSample({ tokens }: { tokens: OverlayStyleTokens }) {
  useOverlayFonts([tokens.font], false);
  // The preview's reference size is 1080 px high; the sample is a third of that, like a phone.
  const scale = 0.4;
  return (
    <div
      aria-hidden
      className="flex h-16 items-center justify-center overflow-hidden rounded-md bg-[linear-gradient(135deg,#7c9f6b,#c9d6a3_45%,#8fb4d9)]"
    >
      <div style={{ ...boxStyleOf(tokens), zoom: scale }}>{texts.sample}</div>
    </div>
  );
}

/** The name for a new own style; saved on Enter or with the button, not while typing. */
function NameForm({ onSave }: { onSave: (name: string) => void }) {
  const [name, setName] = useState('');
  const id = useId();
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(name);
      }}
    >
      <div className="grid flex-1 gap-1">
        <label htmlFor={id} className="text-muted-foreground text-xs">
          {texts.ownName}
        </label>
        <Input
          id={id}
          value={name}
          placeholder={texts.ownNamePlaceholder}
          autoFocus
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <Button type="submit" size="sm">
        {texts.save}
      </Button>
    </form>
  );
}

interface OverlayStyleSectionProps {
  project: Project;
  level: StyleLevel;
  edit: Edit;
}

/**
 * The block style of the project, a group or a stage. A level without its own style shows the
 * inherited one; changing anything gives it a style of its own, and "reset" removes it again.
 */
export function OverlayStyleSection({ project, level, edit }: OverlayStyleSectionProps) {
  const ownStyles = useOwnOverlayStyles();
  const queryClient = useQueryClient();
  const [naming, setNaming] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { own, inherited } = stylesAt(project, level);
  const style = own ?? inherited!.style;
  const tokens = overlayTokensOf(style, ownStyles);
  // The project's units live in its defaults; a group or stage keeps its own with its style.
  const units = (level.kind === 'project' ? undefined : style.units) ?? project.defaults.units;
  const field =
    level.kind === 'project'
      ? 'defaults.overlayStyle'
      : level.kind === 'group'
        ? 'overlayStyle'
        : 'overlays.style';
  const setStyle = (next: OverlayStyleRef | undefined, coalesce = false) =>
    edit(field, (p) => writeStyle(p, level, next), { coalesce });
  /** One part of the style changed at this level, on top of the chosen style. */
  const setToken = <K extends keyof OverlayStyleTokens>(key: K, value: OverlayStyleTokens[K]) =>
    setStyle({ ...style, overrides: { ...style.overrides, [key]: value } }, true);

  /** Keeps the look as it is now as an own style, for every project, and switches to it. */
  const saveAsOwn = (name: string) => {
    if (!name.trim()) {
      setSaveError(texts.nameRequired);
      return;
    }
    const saved: OverlayStyle = {
      id: `style-${crypto.randomUUID().slice(0, 8)}`,
      name: name.trim(),
      tokens,
    };
    setSaveError(null);
    void api
      .saveOverlayStyle(saved)
      .then(async () => {
        await queryClient.invalidateQueries({ queryKey: OVERLAY_STYLES_QUERY_KEY });
        setNaming(false);
        const problem = setStyle({ styleId: saved.id, ...(style.units && { units: style.units }) });
        if (problem) setSaveError(problem);
      })
      .catch((caught: unknown) =>
        setSaveError(texts.saveFailed(caught instanceof Error ? caught.message : String(caught))),
      );
  };

  const known =
    BUILT_IN_OVERLAY_STYLE_IDS.includes(style.styleId) ||
    ownStyles.some((own) => own.id === style.styleId);
  const styleOptions = [
    ...BUILT_IN_OVERLAY_STYLE_IDS.map((id) => ({ value: id, label: texts.styles[id] ?? id })),
    ...ownStyles.map((own) => ({ value: own.id, label: own.name })),
    ...(known ? [] : [{ value: style.styleId, label: style.styleId }]),
  ];

  return (
    <Section title={texts.styleTitle}>
      {inherited && (
        <div className="text-muted-foreground flex items-start justify-between gap-2 text-xs">
          <span>{own ? texts.styleOwn : inherited.note}</span>
          {own && (
            <Button size="xs" variant="outline" onClick={() => setStyle(undefined)}>
              {de.inspector.mapStyle.reset}
            </Button>
          )}
        </div>
      )}
      <SelectField
        label={texts.units}
        value={units}
        options={optionsOf(UnitsSchema.options, texts.unitNames)}
        onCommit={(next) =>
          level.kind === 'project'
            ? edit('defaults.units', (p) => ({ ...p, defaults: { ...p.defaults, units: next } }))
            : setStyle({ ...style, units: next })
        }
      />
      <SelectField
        label={texts.style}
        value={style.styleId}
        options={styleOptions}
        hint={known ? undefined : texts.styleMissing}
        // A new style starts clean: changes made to the old one would hide what it looks like.
        onCommit={(styleId) => setStyle({ styleId, ...(style.units && { units: style.units }) })}
      />
      <StyleSample tokens={tokens} />
      <SelectField
        label={texts.font}
        value={tokens.font}
        options={optionsOf(OVERLAY_FONTS, texts.fonts)}
        onCommit={(font) => setToken('font', font)}
      />
      <SliderField
        label={texts.size}
        value={tokens.size}
        min={20}
        max={120}
        step={1}
        format={(size) => `${size} px`}
        onCommit={(size) => setToken('size', size)}
      />
      <ColorField
        label={texts.textColor}
        value={tokens.textColor}
        onCommit={(color) => (color ? setToken('textColor', color) : null)}
      />
      <SelectField
        label={texts.background}
        value={tokens.background}
        options={optionsOf(OverlayBackgroundSchema.options, texts.backgrounds)}
        onCommit={(background) => setToken('background', background)}
      />
      {tokens.background !== 'none' && (
        <ColorField
          label={texts.backgroundColor}
          value={tokens.backgroundColor}
          onCommit={(color) => (color ? setToken('backgroundColor', color) : null)}
        />
      )}
      <SwitchField
        label={texts.uppercase}
        checked={tokens.uppercase}
        onCommit={(on) => setToken('uppercase', on)}
      />
      <SwitchField
        label={texts.outline}
        checked={tokens.outline}
        onCommit={(on) => setToken('outline', on)}
      />
      <SwitchField
        label={texts.shadow}
        checked={tokens.shadow}
        onCommit={(on) => setToken('shadow', on)}
      />
      {style.overrides && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => {
            const { overrides: _old, ...rest } = style;
            return setStyle(rest);
          }}
        >
          {texts.resetOverrides}
        </Button>
      )}
      {naming ? (
        <NameForm onSave={saveAsOwn} />
      ) : (
        <Button variant="outline" size="sm" className="w-full" onClick={() => setNaming(true)}>
          {texts.saveAsOwn}
        </Button>
      )}
      {saveError && <p className="text-destructive text-xs">{saveError}</p>}
    </Section>
  );
}
