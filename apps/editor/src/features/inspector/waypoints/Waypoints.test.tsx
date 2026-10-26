import {
  addEtappe,
  addGroup,
  addTrack,
  addWaypoint,
  createProject,
  type Place,
  type Project,
  type VehicleType,
} from '@travel-route-animator/core';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, createQueryClient } from '@/AppProviders';
import { EditorScreen } from '@/features/editor/EditorScreen';
import { installFakeServer, type FakeSearch } from '@/test/fakeServer';

type User = ReturnType<typeof userEvent.setup>;

const vie: Place = {
  id: 'airport:VIE',
  name: 'Vienna International Airport',
  lngLat: [16.5697, 48.1103],
  kind: 'airport',
  source: 'airport',
  airportCode: 'VIE',
  city: 'Vienna',
  countryCode: 'AT',
};
const opo: Place = {
  ...vie,
  id: 'airport:OPO',
  name: 'Francisco de Sá Carneiro Airport',
  lngLat: [-8.6814, 41.2481],
  airportCode: 'OPO',
  city: 'Porto',
};
const porto: Place = {
  id: 'photon:R1',
  name: 'Porto',
  lngLat: [-8.6291, 41.1579],
  kind: 'locality',
  source: 'search',
  country: 'Portugal',
};

/** A stage "Wien – Porto" with one vehicle and the given waypoints. */
function trip(vehicle: VehicleType, label: string, points: [string, [number, number]][] = []) {
  const group = addGroup(createProject('Trip'), 'Hinreise');
  const stage = addEtappe(group.project, group.id, 'Wien – Porto');
  const track = addTrack(stage.project, stage.id, vehicle, { label });
  let project = track.project;
  for (const [name, lngLat] of points) {
    project = addWaypoint(project, track.id, { name, lngLat }).project;
  }
  return project;
}

async function renderEditor(project: Project, search: FakeSearch) {
  const server = installFakeServer([project], search);
  render(
    <AppProviders queryClient={createQueryClient()}>
      <EditorScreen projectId={project.id} />
    </AppProviders>,
  );
  await screen.findByRole('heading', { level: 1, name: project.name });
  return { server, user: userEvent.setup() };
}

const inspector = () => within(screen.getByRole('region', { name: 'Eigenschaften' }));
const waypointRows = () =>
  within(inspector().getByRole('list', { name: 'Wegpunkte' }))
    .getAllByRole('listitem')
    .map((row) => row.getAttribute('aria-label'));

/** Focuses without clicking; see EditorScreen.test.tsx for why clicks misbehave in jsdom. */
function focus(element: HTMLElement) {
  act(() => element.focus());
}

const suggestions = () =>
  within(screen.getByRole('listbox', { name: 'Vorschläge' })).getAllByRole('option');

/** Opens a waypoint's menu and picks an entry, from the keyboard like a real user can. */
async function chooseFromMenu(user: User, waypoint: number, entry: string) {
  focus(inspector().getByRole('button', { name: `Aktionen für Wegpunkt ${waypoint}` }));
  await user.keyboard('{Enter}');
  focus(await screen.findByRole('menuitem', { name: entry }));
  await user.keyboard('{Enter}');
}

async function selectRow(name: string) {
  focus(await screen.findByRole('treeitem', { name }));
}

async function search(user: User, text: string) {
  const field = inspector().getByRole('combobox', { name: 'Ort oder Flughafen suchen' });
  focus(field);
  await user.keyboard('{Control>}a{/Control}{Backspace}');
  await user.keyboard(text);
  return field;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('waypoints in the inspector', () => {
  it('adds airports by code and by name, airports first for a plane', async () => {
    const { user } = await renderEditor(trip('plane', 'Flugzeug'), {
      airports: (q) => (q === 'VIE' ? [vie] : [opo]),
      places: () => [porto],
    });
    await selectRow('Flugzeug');

    const field = await search(user, 'VIE');
    expect(
      await screen.findByRole('option', { name: /Vienna International Airport/ }),
    ).toBeVisible();
    await user.keyboard('{Enter}');
    expect(waypointRows()).toEqual(['Wegpunkt 1: Vienna International Airport']);
    expect(field).toHaveValue('');

    await search(user, 'Flughafen Porto');
    await waitFor(() =>
      expect(suggestions().map((option) => option.textContent)).toEqual([
        expect.stringContaining('Francisco de Sá Carneiro Airport'),
        expect.stringContaining('Porto'),
      ]),
    );
    // The highlighted (first) suggestion; choosing by mouse is checked in the browser.
    await user.keyboard('{Enter}');
    expect(waypointRows()).toEqual([
      'Wegpunkt 1: Vienna International Airport',
      'Wegpunkt 2: Francisco de Sá Carneiro Airport',
    ]);
    expect(inspector().getByText('Bereit zum Rendern.')).toBeInTheDocument();
  });

  it('puts towns first for vehicles on the ground', async () => {
    const { user } = await renderEditor(trip('car', 'Auto'), {
      airports: () => [opo],
      places: () => [porto],
    });
    await selectRow('Auto');
    await search(user, 'Porto');
    await waitFor(() => expect(suggestions()).toHaveLength(2));
    expect(suggestions()[0]).toHaveTextContent(/^Porto/);
  });

  it('prefers the area of the trip so far', async () => {
    const places = vi.fn(() => [porto]);
    const { user } = await renderEditor(trip('car', 'Auto', [['Lisboa', [-9.1393, 38.7223]]]), {
      airports: () => [],
      places,
    });
    await selectRow('Auto');
    await search(user, 'Silves');
    await waitFor(() => expect(places).toHaveBeenCalledWith('Silves', '-9.1393,38.7223,9'));
  });

  it('says when airport data is missing and when the place search is down', async () => {
    const { user } = await renderEditor(trip('car', 'Auto'), {});
    await selectRow('Auto');
    await search(user, 'Wien');
    expect(await inspector().findByText(/pnpm data:airports/)).toBeInTheDocument();
    expect(
      await inspector().findByText(/Ortssuche ist gerade nicht erreichbar/),
    ).toBeInTheDocument();
  });

  it('switches stop and shape point, keeps the ends as stops and reorders', async () => {
    const { user } = await renderEditor(
      trip('car', 'Auto', [
        ['Lisboa', [-9.1393, 38.7223]],
        ['Silves', [-8.4385, 37.1889]],
        ['Faro', [-7.9304, 37.0194]],
      ]),
      { airports: () => [], places: () => [] },
    );
    await selectRow('Auto');

    expect(inspector().getByRole('button', { name: /^Wegpunkt 1: Stopp/ })).toBeDisabled();
    expect(inspector().getByRole('button', { name: /^Wegpunkt 3: Stopp/ })).toBeDisabled();
    await user.click(inspector().getByRole('button', { name: /^Wegpunkt 2: Stopp/ }));
    const silves = inspector().getByRole('listitem', { name: 'Wegpunkt 2: Silves' });
    expect(within(silves).getByText(/Formpunkt: unsichtbar/)).toBeInTheDocument();
    expect(within(silves).queryByLabelText('Halt')).toBeNull();

    await chooseFromMenu(user, 2, 'Nach unten');
    expect(waypointRows()).toEqual([
      'Wegpunkt 1: Lisboa',
      'Wegpunkt 2: Faro',
      'Wegpunkt 3: Silves',
    ]);
    // A shape point at the end is allowed while editing, but the stage is not renderable then.
    expect(inspector().getByRole('note')).toHaveTextContent(
      'Der letzte Wegpunkt muss ein Stopp sein',
    );

    await chooseFromMenu(user, 3, 'Löschen');
    expect(waypointRows()).toEqual(['Wegpunkt 1: Lisboa', 'Wegpunkt 2: Faro']);
    await user.click(screen.getByRole('button', { name: /Rückgängig/ }));
    expect(waypointRows()).toHaveLength(3);
  });

  it('edits the coordinates and explains a swapped latitude', async () => {
    const { user } = await renderEditor(trip('car', 'Auto', [['Wien', [16.3725, 48.2084]]]), {
      airports: () => [],
      places: () => [],
    });
    await selectRow('Auto');
    await chooseFromMenu(user, 1, 'Koordinaten bearbeiten …');

    const dialog = await screen.findByRole('dialog', { name: 'Koordinaten von „Wien“' });
    const latitude = within(dialog).getByLabelText('Breitengrad');
    expect(latitude).toHaveValue('48,2084');
    focus(latitude);
    await user.keyboard('{Control>}a{/Control}116,37');
    expect(latitude).toBeInvalid();
    expect(latitude).toHaveAccessibleDescription(/vertauscht/);
  });

  it('switches to setting points on the map and back', async () => {
    const { user } = await renderEditor(trip('car', 'Auto'), {
      airports: () => [],
      places: () => [],
    });
    await selectRow('Auto');
    const crosshair = inspector().getByRole('button', { name: 'Punkt auf Karte setzen' });
    expect(crosshair).toHaveAttribute('aria-pressed', 'false');

    await user.click(crosshair);
    expect(crosshair).toHaveAttribute('aria-pressed', 'true');
    // Escape ends the mode wherever the focus is, as on the map.
    await user.keyboard('{Escape}');
    expect(crosshair).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps the editor working without WebGL and says why the map is missing', async () => {
    await renderEditor(trip('car', 'Auto'), { airports: () => [], places: () => [] });
    const map = screen.getByRole('region', { name: 'Bearbeitungskarte' });
    expect(await within(map).findByText(/WebGL fehlt/)).toBeInTheDocument();
  });
});
