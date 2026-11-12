import { renameItem, type OutputSettings, type Project } from '@travel-route-animator/core';
import { de } from '@/i18n/de';
import { SelectField } from './fields/SelectField';
import { TextField } from './fields/TextField';
import { MapStyleSection } from './MapStyleSection';
import { TransitionSection } from './TransitionSection';
import { FormHeading, LaterNote, optionsOf, Row, Section } from './parts';
import { useEdit } from './useEdit';

export const ASPECTS = ['16:9', '9:16', '1:1', '4:5'] as const;
export const RESOLUTIONS = ['720p', '1080p', '1440p', '2160p'] as const;
export const FRAME_RATES = ['24', '25', '30', '50', '60'] as const;

export function ProjectForm({ project }: { project: Project }) {
  const edit = useEdit({ kind: 'project' });
  const { output } = project.defaults;

  function setOutput<K extends keyof OutputSettings>(key: K, value: OutputSettings[K]) {
    return edit(`defaults.output.${key}`, (p) => ({
      ...p,
      defaults: { ...p.defaults, output: { ...p.defaults.output, [key]: value } },
    }));
  }

  return (
    <>
      <FormHeading kind={de.inspector.kinds.project} name={project.name} />
      <TextField
        label={de.inspector.name}
        value={project.name}
        onCommit={(name) => edit('name', (p) => renameItem(p, p.id, name), { coalesce: true })}
      />

      <Section title={de.inspector.project.output}>
        <SelectField
          label={de.inspector.project.aspect}
          value={output.aspect}
          options={optionsOf(ASPECTS, de.inspector.aspects)}
          onCommit={(aspect) => setOutput('aspect', aspect)}
        />
        <Row>
          <SelectField
            label={de.inspector.project.resolution}
            value={output.resolution}
            options={RESOLUTIONS.map((value) => ({ value, label: value }))}
            onCommit={(resolution) => setOutput('resolution', resolution)}
          />
          <SelectField
            label={de.inspector.project.fps}
            value={String(output.fps) as (typeof FRAME_RATES)[number]}
            options={FRAME_RATES.map((value) => ({ value, label: `${value} fps` }))}
            onCommit={(fps) => setOutput('fps', Number(fps) as OutputSettings['fps'])}
          />
        </Row>
      </Section>

      <MapStyleSection project={project} level={{ kind: 'project' }} edit={edit} />
      <TransitionSection project={project} edit={edit} />

      <LaterNote text={de.inspector.project.later} />
    </>
  );
}
