import {
  addEtappe,
  addGroup,
  addTrack,
  createProject,
  type Project,
} from '@travel-route-animator/core';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, createQueryClient } from '@/AppProviders';
import { EditorScreen } from '@/features/editor/EditorScreen';
import { installFakeServer } from '@/test/fakeServer';

type User = ReturnType<typeof userEvent.setup>;

async function renderEditor(project: Project) {
  const server = installFakeServer([project]);
  render(
    <AppProviders queryClient={createQueryClient()}>
      <EditorScreen projectId={project.id} />
    </AppProviders>,
  );
  await screen.findByRole('heading', { level: 1, name: project.name });
  return { server, user: userEvent.setup() };
}

/**
 * A group "Hinreise" with the stage "Wien – Porto", optionally with a car in it. The car is
 * labelled "Auto", as the tree labels every new vehicle.
 */
function trip({ withCar = false } = {}) {
  const outward = addGroup(createProject('Trip'), 'Hinreise');
  const stage = addEtappe(outward.project, outward.id, 'Wien – Porto');
  const project = withCar
    ? addTrack(stage.project, stage.id, 'car', { label: 'Auto' }).project
    : stage.project;
  return { project, etappeId: stage.id };
}

const inspector = () => within(screen.getByRole('region', { name: 'Eigenschaften' }));

/** Selects a tree row the way focusing it does in the browser (see EditorScreen.test.tsx). */
async function selectRow(name: string) {
  const row = await screen.findByRole('treeitem', { name });
  act(() => row.focus());
}

/**
 * Puts the focus on a field without clicking. In jsdom every element has zero size, so the
 * resizable panels take any click for a hit on their separator and pull the focus away (see
 * EditorScreen.test.tsx); user.type and user.clear click first.
 */
function focus(field: HTMLElement) {
  act(() => field.focus());
}

/** Replaces the text of a field from the keyboard. */
async function typeInto(user: User, field: HTMLElement, text: string) {
  focus(field);
  await user.keyboard('{Control>}a{/Control}{Backspace}');
  if (text) await user.keyboard(text);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Inspector', () => {
  it('shows the project when nothing is selected and refuses an empty name', async () => {
    const { user } = await renderEditor(createProject('Trip'));
    const name = inspector().getByLabelText('Name');

    await typeInto(user, name, '');
    expect(name).toBeInvalid();
    expect(name).toHaveAccessibleDescription('Darf nicht leer sein.');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Trip');

    // Leaving the field with an invalid value brings back the stored one.
    await user.tab();
    expect(name).toHaveValue('Trip');
    expect(name).toBeValid();

    await typeInto(user, name, 'Portugal 2026');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Portugal 2026');
  });

  it('explains an invalid duration at the field and keeps the stored value', async () => {
    const { user } = await renderEditor(trip().project);
    await selectRow('Wien – Porto');
    const duration = inspector().getByLabelText('Dauer der Fahrt');
    expect(duration).toHaveValue('8');

    await typeInto(user, duration, '0');
    expect(duration).toBeInvalid();
    expect(duration).toHaveAccessibleDescription('Muss größer als 0 sein.');
    await user.tab();
    expect(duration).toHaveValue('8');

    // A decimal comma works, and typing it is one undo step.
    await typeInto(user, duration, '12,5');
    await user.tab();
    expect(duration).toHaveValue('12,5');
    await user.click(screen.getByRole('button', { name: /Rückgängig/ }));
    expect(duration).toHaveValue('8');
  });

  it('steps numbers with the arrow keys', async () => {
    const { user } = await renderEditor(trip().project);
    await selectRow('Wien – Porto');
    const bearing = inspector().getByLabelText('Ausrichtung');

    focus(bearing);
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(bearing).toHaveValue('10');
    await user.keyboard('{Shift>}{ArrowDown}{/Shift}');
    expect(bearing).toHaveValue('-40');
  });

  it('keeps a flat 2D view at 0° and tilts a 3D view', async () => {
    const { user } = await renderEditor(trip().project);
    await selectRow('Wien – Porto');
    const pitch = inspector().getByLabelText('Neigung');
    expect(pitch).toBeDisabled();
    expect(pitch).toHaveAccessibleDescription('In 2D immer 0°.');

    await user.selectOptions(inspector().getByLabelText('Ansicht'), '3D geneigt');
    expect(pitch).toBeEnabled();
    expect(pitch).toHaveValue('55');
  });

  it('offers only the routing a vehicle allows and keeps it consistent on a switch', async () => {
    const { user } = await renderEditor(trip({ withCar: true }).project);
    await selectRow('Auto');
    const routing = inspector().getByLabelText('Routing');
    expect(
      within(routing)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Straße', 'Gerade Linien', 'GPX-Datei']);
    expect(within(routing).getByRole('option', { name: 'GPX-Datei' })).toBeDisabled();

    await user.selectOptions(inspector().getByLabelText('Fahrzeug'), 'Zug');
    expect(routing).toHaveDisplayValue('Geglättete Kurve');
    expect(screen.getByRole('treeitem', { name: 'Zug' })).toBeInTheDocument();
  });

  it('edits the flight of a plane and says how it is drawn', async () => {
    const { project, etappeId } = trip();
    const withPlane = addTrack(project, etappeId, 'plane', { label: 'Flugzeug' }).project;
    const { user } = await renderEditor(withPlane);
    await selectRow('Flugzeug');
    const arc = inspector().getByLabelText('Bogenhöhe');
    expect(arc).toHaveValue('15');
    // A plane as the first vehicle makes the stage a tilted globe: the arc is real 3D.
    expect(inspector().getByText(/echtem 3D/)).toBeInTheDocument();

    await typeInto(user, arc, '80');
    await user.keyboard('{Enter}');
    expect(arc).toBeInvalid();
    await typeInto(user, arc, '25');
    await user.keyboard('{Enter}');
    expect(arc).toBeValid();
    expect(arc).toHaveValue('25');

    const shadow = inspector().getByRole('switch', { name: 'Schatten am Boden' });
    await user.click(shadow);
    expect(shadow).not.toBeChecked();

    const planeType = inspector().getByLabelText('Flugzeugtyp');
    expect(planeType).toHaveDisplayValue('Standard');
    await user.selectOptions(planeType, 'Airbus A380');
    expect(planeType).toHaveDisplayValue('Airbus A380');
  });

  it('shows no flight options for a car', async () => {
    await renderEditor(trip({ withCar: true }).project);
    await selectRow('Auto');
    expect(inspector().queryByLabelText('Bogenhöhe')).toBeNull();
  });

  it('gives a track its own duration and warns when it runs past the stage', async () => {
    const { user } = await renderEditor(trip({ withCar: true }).project);
    await selectRow('Auto');
    const untilEnd = inspector().getByRole('switch', { name: 'Fährt bis zum Etappenende' });
    expect(untilEnd).toBeChecked();
    expect(inspector().queryByLabelText('Dauer')).toBeNull();

    await user.click(untilEnd);
    expect(inspector().getByLabelText('Dauer')).toHaveValue('8');

    // Running past the end is allowed while editing, but the stage is not renderable then.
    const start = inspector().getByLabelText('Start');
    await typeInto(user, start, '3');
    expect(start).toBeValid();
    expect(inspector().getByRole('note')).toHaveTextContent(
      'Die Fahrt dauert bis 11 s, die Etappe nur 8 s.',
    );
  });

  it('names the vehicle a stage-level warning is about', async () => {
    const { project, etappeId } = trip({ withCar: true });
    await renderEditor(addTrack(project, etappeId, 'bus').project);
    await selectRow('Wien – Porto');
    const note = inspector().getByRole('note');
    expect(note).toHaveTextContent('Auto: Noch keine Wegpunkte');
    expect(note).toHaveTextContent('Bus: Noch keine Wegpunkte');
  });

  it('sets, checks and removes the colour of a group', async () => {
    const { server, user } = await renderEditor(trip().project);
    await selectRow('Hinreise');
    const color = inspector().getByLabelText('Farbe im Projektbaum');

    await typeInto(user, color, '#2680e');
    expect(color).toHaveAccessibleDescription('Bitte eine Farbe wie #E4572E eingeben.');
    await user.keyboard('b');
    expect(color).toBeValid();
    await waitFor(
      () => expect([...server.projects.values()][0]?.groups[0]?.color).toBe('#2680EB'),
      { timeout: 3000 },
    );

    await user.click(inspector().getByRole('button', { name: 'Farbe entfernen' }));
    expect(color).toHaveValue('');
  });
});
