import {
  addEtappe,
  addGroup,
  addTrack,
  createProject,
  type Project,
} from '@travel-route-animator/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

  it('gives a car a body type instead of flight options', async () => {
    const { user } = await renderEditor(trip({ withCar: true }).project);
    await selectRow('Auto');
    expect(inspector().queryByLabelText('Bogenhöhe')).toBeNull();

    const carType = inspector().getByLabelText('Fahrzeugtyp');
    expect(carType).toHaveDisplayValue('Limousine');
    expect(carType).toHaveAccessibleDescription(/3D-Autos/);
    await user.selectOptions(carType, 'Wohnmobil');
    expect(carType).toHaveDisplayValue('Wohnmobil');

    // Another vehicle has no body types; a car again starts as the default.
    await user.selectOptions(inspector().getByLabelText('Fahrzeug'), 'Bus');
    expect(inspector().queryByLabelText('Fahrzeugtyp')).toBeNull();
  });

  it('draws a vehicle as an own image, upright or turning, or not at all', async () => {
    const { project } = trip({ withCar: true });
    const { server, user } = await renderEditor(project);
    await selectRow('Auto');
    const kind = inspector().getByLabelText('Darstellung');
    expect(kind).toHaveDisplayValue('Standard');

    // Without any image yet, the form waits for a file and the car keeps its icon.
    await user.selectOptions(kind, 'Eigenes Bild');
    expect(inspector().getByText(/Noch kein Bild gewählt/)).toBeInTheDocument();
    const file = new File([new Uint8Array([0x47, 0x49, 0x46])], 'Läufer.gif', {
      type: 'image/gif',
    });
    await user.upload(inspector().getByLabelText('Bild hinzufügen …'), file);

    expect(await inspector().findByText('96 × 128 px, animiert (8 Bilder)')).toBeInTheDocument();
    expect(inspector().getByRole('img', { name: 'Läufer.gif' })).toHaveAttribute(
      'src',
      expect.stringMatching(/^\/api\/projects\/.+\/assets\/a_\d+\.gif$/),
    );
    const upload = server.calls.find((call) => call.path.includes('/assets'));
    expect(upload).toMatchObject({ method: 'POST' });
    // New images stand upright; the switch lays them flat to turn with the heading.
    const rotates = inspector().getByRole('switch', { name: 'Mit dem Kurs drehen' });
    expect(rotates).not.toBeChecked();
    await user.click(rotates);
    expect(rotates).toBeChecked();

    await user.selectOptions(kind, 'Keins, nur die Linie');
    expect(kind).toHaveAccessibleDescription(/nur die Linie gezeichnet/);
    // The image stays in the project and comes back with one choice.
    await user.selectOptions(kind, 'Eigenes Bild');
    expect(inspector().getByLabelText('Bild')).toHaveDisplayValue('Läufer.gif');
  });

  it('says why the server refused an image', async () => {
    const { project } = trip({ withCar: true });
    const server = installFakeServer([project], {
      upload: () => ({
        status: 422,
        body: {
          error: 'image_rejected',
          message: 'no',
          problem: 'image.tooWide',
          values: { widthPx: 800, heightPx: 600, limit: 512 },
        },
      }),
    });
    render(
      <AppProviders queryClient={createQueryClient()}>
        <EditorScreen projectId={project.id} />
      </AppProviders>,
    );
    await screen.findByRole('heading', { level: 1, name: project.name });
    const user = userEvent.setup();
    await selectRow('Auto');
    await user.selectOptions(inspector().getByLabelText('Darstellung'), 'Eigenes Bild');
    await user.upload(
      inspector().getByLabelText('Bild hinzufügen …'),
      new File([new Uint8Array([1])], 'panorama.png', { type: 'image/png' }),
    );
    expect(await inspector().findByRole('alert')).toHaveTextContent(
      'Das Bild ist 800 × 600 px groß, erlaubt sind höchstens 512 px pro Seite.',
    );
    expect(inspector().getByLabelText('Darstellung')).toHaveDisplayValue('Eigenes Bild');
    expect(server.calls.filter((call) => call.method === 'PUT')).toEqual([]);
  });

  it('sets how the route ahead looks', async () => {
    const { user } = await renderEditor(trip({ withCar: true }).project);
    await selectRow('Auto');
    const ahead = within(inspector().getByRole('region', { name: 'Route voraus' }));
    const opacity = ahead.getByLabelText('Deckkraft');
    const dash = ahead.getByLabelText('Linienart');
    expect(opacity).toHaveValue('35');

    // Range inputs take no typing; a change event is what dragging sends.
    fireEvent.change(opacity, { target: { value: '0' } });
    expect(ahead.getByText('0 %')).toBeInTheDocument();
    expect(dash).toBeDisabled();
    fireEvent.change(opacity, { target: { value: '80' } });
    expect(dash).toBeEnabled();
    await user.selectOptions(dash, 'Gepunktet');
    expect(dash).toHaveDisplayValue('Gepunktet');
    // The driven line keeps its own dash.
    expect(inspector().getAllByLabelText('Linienart')[0]).toHaveDisplayValue('Durchgezogen');
  });

  it('makes the vehicles of a stage read as options in one go', async () => {
    const { project, etappeId } = trip({ withCar: true });
    const { user } = await renderEditor(
      addTrack(project, etappeId, 'car', { label: 'Andere Route' }).project,
    );
    await selectRow('Wien – Porto');
    await user.click(inspector().getByRole('button', { name: 'Als Optionen darstellen' }));

    await selectRow('Andere Route');
    expect(inspector().getAllByLabelText('Linienart')[0]).toHaveDisplayValue('Gestrichelt');
  });

  it('offers options only for a stage with several vehicles', async () => {
    await renderEditor(trip({ withCar: true }).project);
    await selectRow('Wien – Porto');
    expect(inspector().queryByRole('button', { name: 'Als Optionen darstellen' })).toBeNull();
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
