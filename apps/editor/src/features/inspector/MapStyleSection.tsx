import {
  editEtappe,
  editGroup,
  LabelKindSchema,
  MapBaseSchema,
  type Etappe,
  type Group,
  type LabelKind,
  type MapBase,
  type MapStyleRef,
  type Project,
} from '@travel-route-animator/core';
import {
  BUILT_IN_THEMES,
  DEFAULT_THEME_ID,
  effectiveLabels,
  resolveTheme,
} from '@travel-route-animator/styles';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { de } from '@/i18n/de';
import { SelectField } from './fields/SelectField';
import { SwitchField } from './fields/SwitchField';
import { useOwnThemes, useSatelliteAvailable } from './mapStyles';
import { Section } from './parts';
import { ThemeEditorDialog } from './ThemeEditorDialog';
import type { Edit } from './useEdit';

const texts = de.inspector.mapStyle;
const LABEL_KINDS = LabelKindSchema.options;
const SATELLITE = new Set<MapBase>(['satellite', 'satellite-hybrid']);

/** Where a style is set: the project's default, a group's or a stage's (ADR 0010). */
export type StyleLevel =
  | { kind: 'project' }
  | { kind: 'group'; group: Group }
  | { kind: 'etappe'; etappe: Etappe; group: Group };

/** This level's own style and the one it inherits; the project's own is always set. */
function stylesAt(project: Project, level: StyleLevel) {
  const projectStyle = project.defaults.mapStyle;
  switch (level.kind) {
    case 'project':
      return { own: projectStyle, inherited: undefined };
    case 'group':
      return {
        own: level.group.mapStyle,
        inherited: { style: projectStyle, note: texts.fromProject },
      };
    case 'etappe':
      return {
        own: level.etappe.mapStyle,
        inherited: level.group.mapStyle
          ? { style: level.group.mapStyle, note: texts.fromGroup(level.group.name) }
          : { style: projectStyle, note: texts.fromProject },
      };
  }
}

function writeStyle(project: Project, level: StyleLevel, style: MapStyleRef | undefined): Project {
  switch (level.kind) {
    case 'project':
      return style ? { ...project, defaults: { ...project.defaults, mapStyle: style } } : project;
    case 'group':
      return editGroup(project, level.group.id, ({ mapStyle: _old, ...group }) =>
        style ? { ...group, mapStyle: style } : group,
      );
    case 'etappe':
      return editEtappe(project, level.etappe.id, ({ mapStyle: _old, ...etappe }) =>
        style ? { ...etappe, mapStyle: style } : etappe,
      );
  }
}

/**
 * The map style of the project, a group or a stage. A level without its own style shows the
 * inherited one; changing anything there gives the level a style of its own, and "reset"
 * removes it again.
 */
export function MapStyleSection({
  project,
  level,
  edit,
}: {
  project: Project;
  level: StyleLevel;
  edit: Edit;
}) {
  const ownThemes = useOwnThemes();
  const satelliteAvailable = useSatelliteAvailable();
  const [editing, setEditing] = useState(false);
  const { own, inherited } = stylesAt(project, level);
  const style = own ?? inherited!.style;
  const field = level.kind === 'project' ? 'defaults.mapStyle' : 'mapStyle';
  const setStyle = (next: MapStyleRef | undefined) =>
    edit(field, (p) => writeStyle(p, level, next));

  const satellite = SATELLITE.has(style.base);
  const { theme, missing } = resolveTheme(style.themeId, ownThemes);
  const labels = effectiveLabels(theme, style);
  const allOff = LABEL_KINDS.every((kind) => !labels[kind]);

  const setBase = (base: MapBase) =>
    // Themes and colours only apply to vector maps (style.onlyThemedBases).
    setStyle(
      SATELLITE.has(base)
        ? { base, ...(style.labels && { labels: style.labels }) }
        : { ...style, base },
    );
  const setLabel = (kind: LabelKind, on: boolean) =>
    setStyle({ ...style, labels: { ...style.labels, [kind]: on } });
  const setCleanMap = (on: boolean) => {
    if (on) {
      return setStyle({
        ...style,
        labels: Object.fromEntries(LABEL_KINDS.map((kind) => [kind, false])),
      });
    }
    const { labels: _old, ...rest } = style;
    return setStyle(rest);
  };

  const themeOptions = [
    ...BUILT_IN_THEMES.map((t) => ({ value: t.id, label: t.name })),
    ...Object.values(ownThemes).map((t) => ({ value: t.id, label: t.name })),
    ...(missing && style.themeId ? [{ value: style.themeId, label: style.themeId }] : []),
  ];

  return (
    <Section title={texts.title}>
      {inherited && (
        <div className="text-muted-foreground flex items-start justify-between gap-2 text-xs">
          <span>{own ? texts.own : inherited.note}</span>
          {own && (
            <Button size="xs" variant="outline" onClick={() => setStyle(undefined)}>
              {texts.reset}
            </Button>
          )}
        </div>
      )}
      <SelectField
        label={texts.base}
        value={style.base}
        options={MapBaseSchema.options.map((base) => ({
          value: base,
          label: texts.bases[base],
          disabled: base === 'terrain' || (SATELLITE.has(base) && !satelliteAvailable),
        }))}
        hint={
          satelliteAvailable ? (satellite ? texts.satelliteHint : undefined) : texts.satelliteOff
        }
        onCommit={setBase}
      />
      {!satellite && (
        <>
          <SelectField
            label={texts.theme}
            value={style.themeId ?? DEFAULT_THEME_ID}
            options={themeOptions}
            hint={missing ? texts.themeMissing : undefined}
            onCommit={(themeId) => {
              const { overrides: _old, ...rest } = style;
              return setStyle({ ...rest, themeId });
            }}
          />
          <div className="flex gap-1" aria-hidden>
            {(['land', 'water', 'park', 'roadMotorway', 'roadMajor', 'labelText'] as const).map(
              (token) => (
                <span
                  key={token}
                  className="size-4 rounded-sm border"
                  style={{ backgroundColor: theme.tokens[token] }}
                />
              ),
            )}
          </div>
          <Button variant="outline" size="sm" className="w-full" onClick={() => setEditing(true)}>
            {texts.editTheme}
          </Button>
        </>
      )}
      {style.base !== 'satellite' && (
        <fieldset className="space-y-1.5">
          <legend className="text-muted-foreground mb-1 text-xs">{texts.labels}</legend>
          <SwitchField label={texts.cleanMap} checked={allOff} onCommit={setCleanMap} />
          <p className="text-muted-foreground text-xs">{texts.cleanMapHint}</p>
          {LABEL_KINDS.map((kind) => (
            <SwitchField
              key={kind}
              label={texts.labelKinds[kind]}
              checked={labels[kind]}
              onCommit={(on) => setLabel(kind, on)}
            />
          ))}
        </fieldset>
      )}
      {editing && (
        <ThemeEditorDialog
          theme={theme}
          ownThemes={ownThemes}
          onClose={() => setEditing(false)}
          onSaved={(saved) => {
            setEditing(false);
            const { overrides: _old, ...rest } = style;
            return setStyle({ ...rest, themeId: saved.id });
          }}
        />
      )}
    </Section>
  );
}
