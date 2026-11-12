import {
  editGroup,
  TransitionSettingsSchema,
  type Group,
  type Project,
  type TransitionSettings,
} from '@travel-route-animator/core';
import { Button } from '@/components/ui/button';
import { de } from '@/i18n/de';
import { NumberField } from './fields/NumberField';
import { SelectField } from './fields/SelectField';
import { optionsOf, Section } from './parts';
import type { Edit } from './useEdit';

const texts = de.inspector.transition;
const TYPES = TransitionSettingsSchema.shape.type.options;

/**
 * How chained stages follow each other (ADR 0011): the project's default, or a group's own.
 * A group without its own shows the project's; changing it there gives the group its own.
 */
export function TransitionSection({
  project,
  group,
  edit,
}: {
  project: Project;
  /** Missing: the project's default. */
  group?: Group;
  edit: Edit;
}) {
  const own = group ? group.transition : project.defaults.transition;
  const transition = own ?? project.defaults.transition;
  const set = (next: TransitionSettings | undefined) =>
    group
      ? edit('transition', (p) =>
          editGroup(p, group.id, ({ transition: _old, ...rest }) =>
            next ? { ...rest, transition: next } : rest,
          ),
        )
      : edit('defaults.transition', (p) =>
          next ? { ...p, defaults: { ...p.defaults, transition: next } } : p,
        );

  return (
    <Section title={texts.title}>
      {group && (
        <div className="text-muted-foreground flex items-start justify-between gap-2 text-xs">
          <span>{own ? texts.own : texts.fromProject}</span>
          {own && (
            <Button size="xs" variant="outline" onClick={() => set(undefined)}>
              {texts.reset}
            </Button>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <SelectField
          label={texts.type}
          value={transition.type}
          options={optionsOf(TYPES, texts.types)}
          onCommit={(type) => set({ ...transition, type })}
        />
        <NumberField
          label={texts.duration}
          value={transition.durationSec}
          unit={de.fields.seconds}
          step={0.25}
          disabled={transition.type === 'cut'}
          onCommit={(durationSec) => set({ ...transition, durationSec })}
        />
      </div>
      <p className="text-muted-foreground text-xs">{texts.hint}</p>
    </Section>
  );
}
