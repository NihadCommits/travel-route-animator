import {
  addEtappe,
  addGroup,
  addTrack,
  addWaypoint,
  createProject,
  type Project,
  type Widget,
} from '@travel-route-animator/core';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, createQueryClient } from '@/AppProviders';
import { EditorScreen } from '@/features/editor/EditorScreen';
import { installFakeServer } from '@/test/fakeServer';

// The overlay blocks in the inspector (M17): added from a list, set up one by one, styled per
// project, group or stage, and a look kept as an own style for every project.

function trip(): Project {
  const group = addGroup(createProject('Trip'), 'Hinreise');
  const stage = addEtappe(group.project, group.id, 'Salzburg – Linz');
  const train = addTrack(stage.project, stage.id, 'train', { label: 'Zug' });
  let project = train.project;
  for (const [name, lngLat] of [
    ['Salzburg', [13.04, 47.8]],
    ['Linz', [14.29, 48.29]],
  ] as const) {
    project = addWaypoint(project, train.id, { name, lngLat: [...lngLat] }).project;
  }
  return project;
}

async function open(project: Project) {
  const server = installFakeServer([project]);
  render(
    <AppProviders queryClient={createQueryClient()}>
      <EditorScreen projectId={project.id} />
    </AppProviders>,
  );
  await screen.findByRole('heading', { level: 1, name: project.name });
  const user = userEvent.setup();
  /** The project as the server has it, once it holds what the test waits for. */
  const saved = (has: (project: Project) => boolean) =>
    waitFor(
      () => {
        const stored = server.projects.get(project.id)!;
        if (!has(stored)) throw new Error('not saved yet');
        return stored;
      },
      { timeout: 3000 },
    );
  return { server, user, saved };
}

const inspector = () => within(screen.getByRole('region', { name: 'Eigenschaften' }));
const widgetsOf = (project: Project): Widget[] => project.groups[0]!.etappen[0]!.overlays.widgets;

async function selectStage() {
  const row = await screen.findByRole('treeitem', { name: 'Salzburg – Linz' });
  act(() => row.focus());
}

/** Replaces the text of a field from the keyboard (no click, see Inspector.test.tsx). */
async function typeInto(
  user: ReturnType<typeof userEvent.setup>,
  field: HTMLElement,
  text: string,
) {
  act(() => field.focus());
  await user.keyboard(`{Control>}a{/Control}{Backspace}${text}{Enter}`);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('overlay blocks in the inspector', () => {
  it('adds a text block, places it and removes it again', async () => {
    const { user, saved } = await open(trip());
    await selectStage();
    expect(inspector().getByText(/Noch keine Bausteine/)).toBeInTheDocument();

    await user.selectOptions(inspector().getByLabelText('Baustein hinzufügen'), 'Text');
    // A new block opens right away.
    await typeInto(user, inspector().getByLabelText('Text'), 'Tag 4');
    await user.selectOptions(inspector().getByLabelText('Position'), 'Oben rechts');
    expect(inspector().getByRole('button', { name: '„Text: Tag 4“ bearbeiten' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    const withText = await saved((p) => widgetsOf(p)[0]?.anchor === 'top-right');
    expect(widgetsOf(withText)[0]).toMatchObject({ kind: 'text', text: 'Tag 4', dx: 48, dy: 44 });

    await user.click(inspector().getByRole('button', { name: '„Text: Tag 4“ entfernen' }));
    expect(inspector().getByText(/Noch keine Bausteine/)).toBeInTheDocument();
    await saved((p) => widgetsOf(p).length === 0);
  });

  it('puts a block in a row right of another and takes it out again', async () => {
    const { user, saved } = await open(trip());
    await selectStage();
    await user.selectOptions(inspector().getByLabelText('Baustein hinzufügen'), 'Distanz');
    await user.selectOptions(inspector().getByLabelText('Baustein hinzufügen'), 'Reisezeit');
    await user.selectOptions(inspector().getByLabelText('Platz'), 'Rechts neben „Distanz“');
    expect(inspector().queryByLabelText('Position')).not.toBeInTheDocument();
    expect(inspector().getByText(/Steht in einer Reihe/)).toBeInTheDocument();
    const inRow = await saved((p) => widgetsOf(p)[1]?.after !== undefined);
    const [km, time] = widgetsOf(inRow);
    expect(time).toMatchObject({ after: km!.id, anchor: 'bottom-left', dx: 48, dy: 44 });

    // Its own place again: a step above the row.
    await user.selectOptions(inspector().getByLabelText('Platz'), 'Eigener Platz');
    const free = await saved((p) => widgetsOf(p)[1]?.after === undefined);
    expect(widgetsOf(free)[1]).toMatchObject({ anchor: 'bottom-left', dx: 48, dy: 136 });
  });

  it('brings a clock along with a clock block and says what it needs', async () => {
    const { user, saved } = await open(trip());
    await selectStage();
    await user.selectOptions(inspector().getByLabelText('Baustein hinzufügen'), 'Uhrzeit');

    // A train has no recording: the clock runs from a typed departure.
    const source = inspector().getByLabelText('Uhrzeit aus');
    expect(source).toHaveDisplayValue('Eingetragener Abfahrt');
    expect(within(source).getByRole('option', { name: 'Der Aufzeichnung' })).toBeDisabled();
    expect(inspector().getByText(/Trag die Abfahrt ein/)).toBeInTheDocument();
    const stored = await saved((p) => p.groups[0]!.etappen[0]!.clock !== undefined);
    expect(stored.groups[0]!.etappen[0]!.clock?.source).toBe('manual');

    // Speed needs a recording, and says so under its row.
    await user.selectOptions(inspector().getByLabelText('Baustein hinzufügen'), 'Geschwindigkeit');
    expect(
      inspector().getByText(/Nur mit einer Aufzeichnung mit Zeitstempeln/),
    ).toBeInTheDocument();
  });

  it('sets units, decimals and a time window for one block', async () => {
    const { user, saved } = await open(trip());
    await selectStage();
    await user.selectOptions(inspector().getByLabelText('Baustein hinzufügen'), 'Distanz');
    expect(inspector().getByLabelText('Einheit')).toHaveDisplayValue(
      'Wie im Projekt (Metrisch (km, m))',
    );
    await user.selectOptions(inspector().getByLabelText('Einheit'), 'Imperial (mi, ft)');
    await user.selectOptions(inspector().getByLabelText('Nachkommastellen'), '1');
    await user.click(inspector().getByRole('switch', { name: 'Die ganze Etappe zeigen' }));
    await user.selectOptions(inspector().getByLabelText('Übergang'), 'Einblenden');

    const stored = await saved((p) => widgetsOf(p)[0]?.transition === 'fade');
    expect(widgetsOf(stored)[0]).toMatchObject({
      kind: 'distance',
      unit: 'imperial',
      decimals: 1,
      fromSec: 0,
      toSec: 5,
    });
  });

  it('gives a group imperial units and a font of its own, for all its stages', async () => {
    const { user, saved } = await open(trip());
    const row = await screen.findByRole('treeitem', { name: /Hinreise/ });
    act(() => row.focus());
    const styleSection = within(
      inspector().getByRole('region', { name: 'Stil der Einblendungen' }),
    );
    await user.selectOptions(styleSection.getByLabelText('Einheiten'), 'Imperial (mi, ft)');
    await user.selectOptions(styleSection.getByLabelText('Schrift'), 'Montserrat');
    const stored = await saved((p) => p.groups[0]!.overlayStyle?.overrides?.font === 'montserrat');
    expect(stored.groups[0]!.overlayStyle).toEqual({
      styleId: 'classic',
      units: 'imperial',
      overrides: { font: 'montserrat' },
    });
    expect(stored.defaults.units).toBe('metric');

    // The stage inherits both.
    await selectStage();
    const stage = within(inspector().getByRole('region', { name: 'Stil der Einblendungen' }));
    expect(stage.getByLabelText('Einheiten')).toHaveDisplayValue('Imperial (mi, ft)');
    expect(stage.getByLabelText('Schrift')).toHaveDisplayValue('Montserrat');
  });

  it('styles the project, lets a stage inherit it and keeps a look as an own style', async () => {
    const { server, user, saved } = await open(trip());
    // Nothing selected: the project's form.
    await user.selectOptions(inspector().getByLabelText('Einheiten'), 'Imperial (mi, ft)');
    await user.selectOptions(inspector().getByLabelText('Stil'), 'Sport');
    expect(inspector().getByLabelText('Schrift')).toHaveDisplayValue('Oswald');
    await saved(
      (p) => p.defaults.overlayStyle.styleId === 'sport' && p.defaults.units === 'imperial',
    );

    await selectStage();
    const styleSection = within(
      inspector().getByRole('region', { name: 'Stil der Einblendungen' }),
    );
    expect(styleSection.getByText(/Geerbt vom Projekt/)).toBeInTheDocument();
    await user.selectOptions(styleSection.getByLabelText('Schrift'), 'Bebas Neue');
    expect(styleSection.getByText('Eigener Stil für diese Ebene.')).toBeInTheDocument();

    await user.click(styleSection.getByRole('button', { name: 'Als eigenen Stil speichern …' }));
    await typeInto(user, styleSection.getByLabelText('Name des eigenen Stils'), 'Mein Vlog');
    const own = await waitFor(() => {
      const [style] = server.overlayStyles.values();
      if (!style) throw new Error('not saved yet');
      return style;
    });
    expect(own).toMatchObject({ name: 'Mein Vlog', tokens: { font: 'bebas-neue' } });
    await waitFor(() =>
      expect(styleSection.getByLabelText('Stil')).toHaveDisplayValue('Mein Vlog'),
    );
    const stored = await saved((p) => p.groups[0]!.etappen[0]!.overlays.style?.styleId === own.id);
    expect(stored.groups[0]!.etappen[0]!.overlays.style).toEqual({ styleId: own.id });
  });
});
