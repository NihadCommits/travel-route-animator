import {
  addWidget,
  editEtappe,
  parseDurationText,
  removeWidget,
  WIDGET_KINDS,
  type Clock,
  type Etappe,
  type Project,
  type Track,
  type Widget,
  type WidgetKind,
} from '@travel-route-animator/core';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/features/inspector/fields/SelectField';
import { TextField } from '@/features/inspector/fields/TextField';
import { Section } from '@/features/inspector/parts';
import type { Edit } from '@/features/inspector/useEdit';
import { de } from '@/i18n/de';
import { blockName } from './blockName';
import { ClockFields, defaultClock } from './ClockFields';
import { WidgetEditor } from './WidgetEditor';

// The blocks of a stage (M17): a list to add to, open and remove from. Each block is placed and
// styled on its own; where the preview shows it, it can also be dragged.

const texts = de.overlays;
const measured = de.inspector.etappe.measured;

/** Kinds that show the time of day and need the stage's clock. */
const CLOCK_KINDS = new Set<WidgetKind>(['clock', 'date']);
/** Kinds that need the heights of the route. */
const HEIGHT_KINDS = new Set<WidgetKind>(['elevationProfile', 'climb', 'altitude']);

interface WidgetsSectionProps {
  project: Project;
  etappe: Etappe;
  edit: Edit;
  /** The track the blocks count along: the followed one, else the first. */
  counted: Track | undefined;
  /** Whether the stage has a travel time: from the router, a recording or a typed duration. */
  hasTravelTime: boolean;
  /** What the route's heights are doing, for the blocks that need them. */
  elevationNote: string | undefined;
}

export function WidgetsSection({
  project,
  etappe,
  edit,
  counted,
  hasTravelTime,
  elevationNote,
}: WidgetsSectionProps) {
  const [open, setOpen] = useState<string | undefined>();
  const { overlays, clock } = etappe;
  const recording = counted?.computed?.recording ?? counted?.imported?.recording;
  const change = (field: string, update: (e: Etappe) => Etappe, coalesce = false) =>
    edit(field, (p) => editEtappe(p, etappe.id, update), { coalesce });
  const setClock = (next: Clock) => change('clock', (e) => ({ ...e, clock: next }), true);

  const add = (kind: WidgetKind) => {
    let id: string | undefined;
    const error = edit('overlays.widgets', (p) => {
      const added = addWidget(p, etappe.id, kind);
      id = added.id;
      // A clock or date needs to know when the stage starts; a first clock comes along in the
      // same undo step, from the recording when there is one.
      return CLOCK_KINDS.has(kind) && !clock
        ? editEtappe(added.project, etappe.id, (e) => ({ ...e, clock: defaultClock(recording) }))
        : added.project;
    });
    if (!error) setOpen(id);
    return error;
  };

  /** What a block needs and does not have yet, said under its settings. */
  const kindNote = (kind: WidgetKind): string | undefined => {
    if (kind === 'speed' || kind === 'heartRate' || kind === 'cadence') {
      if (!recording) return measured.noRecording;
      if (kind === 'heartRate' && !recording.heartRateBpm) return measured.noHeartRate;
      if (kind === 'cadence' && !recording.cadenceRpm) return texts.noCadence;
    }
    if (HEIGHT_KINDS.has(kind)) return elevationNote;
    if (kind === 'flag') return texts.flagNote;
    if (kind === 'travelTime' && !hasTravelTime) return de.inspector.etappe.timeCounterNoSource;
    return undefined;
  };

  const durationHint = (() => {
    const typed = overlays.manualDurationText;
    if (typed === undefined) return undefined;
    return parseDurationText(typed) === undefined
      ? de.inspector.etappe.timeCounterUnreadable
      : undefined;
  })();

  /** Fields that belong to the stage but are set where the block that shows them is. */
  const kindFields = (widget: Widget) => {
    if (widget.kind === 'travelTime') {
      return (
        <TextField
          label={de.inspector.etappe.manualDuration}
          value={overlays.manualDurationText ?? ''}
          placeholder={de.inspector.etappe.manualDurationPlaceholder}
          hint={durationHint}
          onCommit={(text) =>
            change(
              'overlays.manualDurationText',
              ({ overlays: { manualDurationText: _old, ...rest }, ...e }) => ({
                ...e,
                overlays: text.trim() === '' ? rest : { ...rest, manualDurationText: text },
              }),
              true,
            )
          }
        />
      );
    }
    if (CLOCK_KINDS.has(widget.kind)) {
      return (
        <ClockFields
          clock={clock ?? defaultClock(recording)}
          recording={recording}
          hasTravelTime={hasTravelTime}
          setClock={setClock}
        />
      );
    }
    return undefined;
  };

  return (
    <Section title={texts.blocks}>
      {overlays.widgets.length === 0 ? (
        <p className="text-muted-foreground text-xs">{texts.empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {overlays.widgets.map((widget) => {
            const name = blockName(widget);
            const expanded = open === widget.id;
            const note = kindNote(widget.kind);
            return (
              <li key={widget.id} className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-w-0 flex-1 justify-start"
                    aria-expanded={expanded}
                    aria-label={texts.edit(name)}
                    onClick={() => setOpen(expanded ? undefined : widget.id)}
                  >
                    {expanded ? <ChevronDown /> : <ChevronRight />}
                    <span className="truncate">{name}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={texts.remove(name)}
                    onClick={() => edit('overlays.widgets', (p) => removeWidget(p, widget.id))}
                  >
                    <Trash2 />
                  </Button>
                </div>
                {note && <p className="text-muted-foreground pl-2 text-xs">{note}</p>}
                {expanded && (
                  <WidgetEditor
                    widget={widget}
                    siblings={overlays.widgets}
                    projectUnits={project.defaults.units}
                    edit={edit}
                  >
                    {kindFields(widget)}
                  </WidgetEditor>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <SelectField<'' | WidgetKind>
        label={texts.add}
        value=""
        options={[
          { value: '', label: texts.choose, disabled: true },
          ...WIDGET_KINDS.map((kind) => ({ value: kind, label: texts.kinds[kind] })),
        ]}
        onCommit={(kind) => (kind === '' ? null : add(kind))}
      />
      <p className="text-muted-foreground text-xs">{texts.dragHint}</p>
    </Section>
  );
}
