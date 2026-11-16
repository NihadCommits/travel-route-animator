import {
  addEtappe,
  addGroup,
  addTrack,
  addWaypoint,
  createProject,
  type Project,
} from '@travel-route-animator/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, createQueryClient } from '@/AppProviders';
import { EditorScreen } from '@/features/editor/EditorScreen';
import { installFakeServer } from '@/test/fakeServer';

/** A group "Hinreise" with the stage "Salzburg – Linz" by train. */
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
  return { server, user: userEvent.setup() };
}

/** Opens a tree row's context menu and picks an entry. */
async function menu(user: ReturnType<typeof userEvent.setup>, row: string, entry: string) {
  // On the row's own text: the menu belongs to the row, not to the item with its children.
  const item = await screen.findByRole('treeitem', { name: row });
  fireEvent.contextMenu(within(item).getAllByText(row)[0]!);
  await user.click(await screen.findByRole('menuitem', { name: entry }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('return trips and templates', () => {
  it('adds the return trip right after the stage, the other way round', async () => {
    const { user } = await open(trip());
    await menu(user, 'Salzburg – Linz', 'Rückfahrt anlegen');
    const back = await screen.findByRole('treeitem', { name: /Salzburg – Linz \(Rückfahrt\)/ });
    expect(back).toBeInTheDocument();
    // Selected, and its train starts in Linz.
    act(() => within(back).getAllByRole('treeitem')[0]!.focus());
    const inspector = within(screen.getByRole('region', { name: 'Eigenschaften' }));
    const stops = await inspector.findAllByRole('textbox', { name: /Name/ });
    expect(stops.map((field) => (field as HTMLInputElement).value).slice(0, 2)).toEqual([
      'Linz',
      'Salzburg',
    ]);
  });

  it('saves a stage as a template and starts a new one from it', async () => {
    const project = trip();
    const { server, user } = await open(project);
    await menu(user, 'Salzburg – Linz', 'Als Vorlage speichern');
    expect(
      await screen.findByText('„Salzburg – Linz“ ist als Vorlage gespeichert.'),
    ).toBeInTheDocument();
    expect(server.calls.some((c) => c.method === 'PUT' && c.path.startsWith('/templates/'))).toBe(
      true,
    );

    await user.click(screen.getByRole('button', { name: 'Aus Vorlage …' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Vorlagen' }));
    await user.click(await dialog.findByRole('button', { name: /^Salzburg – Linz/ }));
    await waitFor(() =>
      expect(screen.getAllByRole('treeitem', { name: /^Salzburg – Linz/ })).toHaveLength(2),
    );
  });

  it('counts the travel time from a typed duration when the route has none', async () => {
    const { user } = await open(trip());
    act(() => screen.getAllByRole('treeitem', { name: 'Salzburg – Linz' })[0]!.focus());
    const inspector = within(screen.getByRole('region', { name: 'Eigenschaften' }));
    await user.selectOptions(inspector.getByLabelText('Baustein hinzufügen'), 'Reisezeit');
    const typed = inspector.getByLabelText('Zeit (statt Routing)');
    expect(
      inspector.getByText(/zählt die Zeit nur mit einem eingetragenen Wert/),
    ).toBeInTheDocument();
    act(() => typed.focus());
    await user.keyboard('eine Weile{Enter}');
    expect(await inspector.findByText(/Lässt sich nicht lesen/)).toBeInTheDocument();
    act(() => typed.focus());
    await user.keyboard('{Control>}a{/Control}2 h 10 min{Enter}');
    await waitFor(() =>
      expect(inspector.queryByText(/Lässt sich nicht lesen/)).not.toBeInTheDocument(),
    );
  });
});
