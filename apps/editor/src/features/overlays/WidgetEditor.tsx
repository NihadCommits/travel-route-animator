import {
  ANCHORS,
  editWidget,
  placeOutOfRow,
  rowFrom,
  OVERLAY_FONTS,
  OverlayBackgroundSchema,
  type OverlayStyleTokens,
  type Units,
  type Widget,
} from '@travel-route-animator/core';
import type { ReactNode } from 'react';
import { ColorField } from '@/features/inspector/fields/ColorField';
import { NumberField } from '@/features/inspector/fields/NumberField';
import { SelectField } from '@/features/inspector/fields/SelectField';
import { SliderField } from '@/features/inspector/fields/SliderField';
import { SwitchField } from '@/features/inspector/fields/SwitchField';
import { TextField } from '@/features/inspector/fields/TextField';
import { optionsOf, Row } from '@/features/inspector/parts';
import type { Edit } from '@/features/inspector/useEdit';
import { de } from '@/i18n/de';
import { blockName } from './blockName';

// The settings of one overlay block (M17): what it says, where it sits, how big, in which
// units, when it shows, and what it changes about the stage's style.

const texts = de.overlays;

/** Kinds whose value has units, and kinds whose value has digits after the point. */
const WITH_UNITS = new Set<Widget['kind']>([
  'distance',
  'speed',
  'altitude',
  'climb',
  'elevationProfile',
]);
const WITH_DECIMALS = new Set<Widget['kind']>(['distance', 'speed']);
/** Kinds that draw a picture and need no caption. */
const WITHOUT_LABEL = new Set<Widget['kind']>(['text', 'elevationProfile', 'flag']);

interface WidgetEditorProps {
  widget: Widget;
  /** The blocks of the same stage, which this one can stand right of. */
  siblings: readonly Widget[];
  /** The project's units, named in "Wie im Projekt". */
  projectUnits: Units;
  edit: Edit;
  /** Extra fields of the kind: the clock's source, a typed duration, a hint. */
  children?: ReactNode;
}

export function WidgetEditor({
  widget,
  siblings,
  projectUnits,
  edit,
  children,
}: WidgetEditorProps) {
  const set = (field: string, update: (widget: Widget) => Widget) =>
    edit(`overlays.widgets.${field}`, (p) => editWidget(p, widget.id, update), { coalesce: true });
  /** Changes one part of the style for this block; undefined goes back to the stage's. */
  const setStyle = <K extends keyof OverlayStyleTokens>(
    key: K,
    value: OverlayStyleTokens[K] | undefined,
  ) =>
    set(`style.${key}`, (w) => {
      const { [key]: _old, ...rest } = w.style ?? {};
      const style = value === undefined ? rest : { ...rest, [key]: value };
      const { style: _was, ...without } = w;
      return Object.keys(style).length === 0 ? without : { ...without, style };
    });
  const whole = widget.fromSec === undefined && widget.toSec === undefined;
  const leader = siblings.find((other) => other.id === widget.after);
  // Not right of itself, nor of a block that already stands behind it: that would be a loop.
  const behind = rowFrom(siblings, widget.id);
  const leaders = siblings.filter((other) => !behind.has(other.id));
  const setPlace = (value: string) =>
    set('after', ({ after: _old, ...w }) => {
      if (value !== 'own') {
        const next = siblings.find((other) => other.id === value)!;
        return { ...w, after: value, anchor: next.anchor, dx: next.dx, dy: next.dy };
      }
      return { ...w, ...(placeOutOfRow(siblings, widget.id) ?? {}) };
    });

  return (
    <div className="border-border grid gap-3 rounded-md border p-3">
      {widget.kind === 'text' && (
        <TextField
          label={texts.text}
          value={widget.text ?? ''}
          onCommit={(text) => set('text', (w) => ({ ...w, text }))}
        />
      )}
      {!WITHOUT_LABEL.has(widget.kind) && (
        <TextField
          label={texts.label}
          value={widget.label ?? ''}
          placeholder={texts.labelPlaceholder}
          onCommit={(label) =>
            set('label', ({ label: _old, ...w }) => (label.trim() === '' ? w : { ...w, label }))
          }
        />
      )}
      {children}

      <SelectField
        label={texts.place}
        value={leader ? leader.id : 'own'}
        options={[
          { value: 'own', label: texts.ownPlace },
          ...leaders.map((other) => ({ value: other.id, label: texts.rightOf(blockName(other)) })),
        ]}
        hint={leader ? texts.inRowHint : undefined}
        onCommit={setPlace}
      />
      {!leader && (
        <>
          <SelectField
            label={texts.anchor}
            value={widget.anchor}
            options={optionsOf(ANCHORS, texts.anchors)}
            onCommit={(anchor) => set('anchor', (w) => ({ ...w, anchor }))}
          />
          <Row>
            <NumberField
              label={texts.dx}
              value={widget.dx}
              unit="px"
              step={4}
              fractionDigits={0}
              onCommit={(dx) => set('dx', (w) => ({ ...w, dx }))}
            />
            <NumberField
              label={texts.dy}
              value={widget.dy}
              unit="px"
              step={4}
              fractionDigits={0}
              onCommit={(dy) => set('dy', (w) => ({ ...w, dy }))}
            />
          </Row>
        </>
      )}
      <SliderField
        label={texts.scale}
        value={widget.scale}
        min={0.5}
        max={3}
        step={0.05}
        format={(scale) => `${Math.round(scale * 100)} %`}
        onCommit={(scale) => set('scale', (w) => ({ ...w, scale }))}
      />

      {WITH_UNITS.has(widget.kind) && (
        <SelectField
          label={texts.unit}
          value={widget.unit ?? 'project'}
          options={[
            { value: 'project', label: texts.unitProject(texts.unitNames[projectUnits]) },
            { value: 'metric', label: texts.unitNames.metric },
            { value: 'imperial', label: texts.unitNames.imperial },
          ]}
          onCommit={(unit) =>
            set('unit', ({ unit: _old, ...w }) => (unit === 'project' ? w : { ...w, unit }))
          }
        />
      )}
      {WITH_DECIMALS.has(widget.kind) && (
        <SelectField
          label={texts.decimals}
          value={String(widget.decimals ?? 0) as '0' | '1' | '2'}
          options={(['0', '1', '2'] as const).map((value) => ({ value, label: value }))}
          onCommit={(digits) => set('decimals', (w) => ({ ...w, decimals: Number(digits) }))}
        />
      )}

      <SwitchField
        label={texts.wholeStage}
        checked={whole}
        onCommit={(on) =>
          set('fromSec', ({ fromSec: _from, toSec: _to, ...w }) =>
            on ? w : { ...w, fromSec: 0, toSec: 5 },
          )
        }
      />
      {!whole && (
        <Row>
          <NumberField
            label={texts.fromSec}
            value={widget.fromSec ?? 0}
            unit={de.fields.seconds}
            step={0.5}
            onCommit={(fromSec) => set('fromSec', (w) => ({ ...w, fromSec }))}
          />
          <NumberField
            label={texts.toSec}
            value={widget.toSec ?? 0}
            unit={de.fields.seconds}
            step={0.5}
            onCommit={(toSec) => set('toSec', (w) => ({ ...w, toSec }))}
          />
        </Row>
      )}
      <SelectField
        label={texts.transition}
        value={widget.transition}
        options={optionsOf(['none', 'fade', 'slide'] as const, texts.transitions)}
        onCommit={(transition) => set('transition', (w) => ({ ...w, transition }))}
      />

      <SelectField
        label={texts.font}
        value={widget.style?.font ?? 'style'}
        options={[
          { value: 'style', label: texts.fromStyle },
          ...optionsOf(OVERLAY_FONTS, texts.fonts),
        ]}
        onCommit={(font) => setStyle('font', font === 'style' ? undefined : font)}
      />
      <SelectField
        label={texts.background}
        value={widget.style?.background ?? 'style'}
        options={[
          { value: 'style', label: texts.fromStyle },
          ...optionsOf(OverlayBackgroundSchema.options, texts.backgrounds),
        ]}
        onCommit={(background) =>
          setStyle('background', background === 'style' ? undefined : background)
        }
      />
      <ColorField
        label={texts.textColor}
        value={widget.style?.textColor}
        allowNone
        onCommit={(color) => setStyle('textColor', color)}
      />
    </div>
  );
}
