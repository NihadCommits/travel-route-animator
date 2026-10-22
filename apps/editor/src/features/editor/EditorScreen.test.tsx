import { addEtappe, addGroup, createProject, type Project } from '@travel-route-animator/core';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, createQueryClient } from '@/AppProviders';
import { installFakeServer } from '@/test/fakeServer';
import { EditorScreen } from './EditorScreen';

function renderEditor(project: Project) {
  const server = installFakeServer([project]);
  const queryClient = createQueryClient();
  render(
    <AppProviders queryClient={queryClient}>
      <EditorScreen projectId={project.id} />
    </AppProviders>,
  );
  return { server, user: userEvent.setup() };
}

const tree = () => screen.getByRole('tree');
const row = (name: string) => within(tree()).getByRole('treeitem', { name });

/**
 * Puts keyboard focus on a tree row, as a click does in a real browser. In jsdom every element
 * has zero size, so the resizable panels treat any click as a hit on their separator and take
 * the focus; focusing the row directly avoids that test-only effect.
 */
async function focusRow(name: string) {
  const item = await screen.findByRole('treeitem', { name });
  act(() => item.focus());
  expect(item).toHaveAttribute('aria-selected', 'true');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('EditorScreen', () => {
  it('shows the project with an empty tree and explains the first step', async () => {
    renderEditor(createProject('Portugal 2026'));
    expect(await screen.findByRole('heading', { name: 'Portugal 2026' })).toBeInTheDocument();
    expect(screen.getByText(/Noch keine Gruppe/)).toBeInTheDocument();
  });

  it('says so when the project does not exist', async () => {
    installFakeServer();
    render(
      <AppProviders>
        <EditorScreen projectId="p_missing" />
      </AppProviders>,
    );
    expect(await screen.findByText('Dieses Projekt gibt es nicht (mehr).')).toBeInTheDocument();
  });

  it('builds a group, a stage and a vehicle, and marks the unfinished stage', async () => {
    const { user } = renderEditor(createProject('Trip'));
    await screen.findByRole('heading', { name: 'Trip' });

    // A new group starts in rename mode.
    await user.click(screen.getByRole('button', { name: /Gruppe/ }));
    await user.keyboard('{Control>}a{/Control}Hinreise{Enter}');
    expect(row('Hinreise')).toHaveAttribute('aria-selected', 'true');

    await user.click(within(row('Hinreise')).getByRole('button', { name: '+ Etappe' }));
    await user.keyboard('{Control>}a{/Control}Wien – Porto{Enter}');

    // Without a vehicle the stage is not renderable yet, and the tree says so.
    expect(within(row('Wien – Porto')).getByLabelText(/Noch kein Fahrzeug/)).toBeInTheDocument();

    await user.click(within(row('Wien – Porto')).getByRole('button', { name: '+ Fahrzeug' }));
    await user.click(screen.getByRole('button', { name: 'Flugzeug' }));

    const plane = row('Flugzeug');
    expect(plane).toHaveAttribute('aria-level', '3');
    expect(within(plane).getByLabelText(/Noch keine Wegpunkte/)).toBeInTheDocument();
    expect(within(row('Wien – Porto')).queryByLabelText(/Noch kein Fahrzeug/)).toBeNull();
  });

  it('renames with F2 and undoes it from the header', async () => {
    const project = createProject('Trip');
    project.groups.push({ id: 'g_1', name: 'Tag 1', etappen: [] });
    const { user } = renderEditor(project);

    await focusRow('Tag 1');
    await user.keyboard('{F2}');
    await user.keyboard('{Control>}a{/Control}Tag 2{Enter}');
    expect(row('Tag 2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Rückgängig/ }));
    expect(row('Tag 1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Wiederholen/ }));
    expect(row('Tag 2')).toBeInTheDocument();
  });

  it('undoes and redoes with the keyboard, but leaves a name being typed alone', async () => {
    const project = createProject('Trip');
    project.groups.push({ id: 'g_1', name: 'Tag 1', etappen: [] });
    const { user } = renderEditor(project);

    await focusRow('Tag 1');
    await user.keyboard('{F2}{Control>}a{/Control}Tag 2{Enter}');
    // Enter puts the focus back on the row, so the keyboard keeps working there.
    expect(row('Tag 2')).toHaveFocus();

    // Inside the rename field Ctrl+Z belongs to the field, not to the project.
    await user.keyboard('{F2}');
    await user.keyboard('{Control>}z{/Control}');
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(row('Tag 2')).toHaveFocus();

    await user.keyboard('{Control>}z{/Control}');
    expect(row('Tag 1')).toBeInTheDocument();
    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    expect(row('Tag 2')).toBeInTheDocument();
    await user.keyboard('{Control>}z{/Control}{Control>}y{/Control}');
    expect(row('Tag 2')).toBeInTheDocument();
  });

  it('moves through the tree with the arrow keys', async () => {
    const outward = addGroup(createProject('Trip'), 'Hinreise');
    const vienna = addEtappe(outward.project, outward.id, 'Wien');
    const { user } = renderEditor(addGroup(vienna.project, 'Rückreise').project);

    // Nothing is selected yet, so the first row is the one Tab reaches.
    expect(await screen.findByRole('treeitem', { name: 'Hinreise' })).toHaveAttribute(
      'tabindex',
      '0',
    );

    await focusRow('Hinreise');
    await user.keyboard('{ArrowDown}');
    expect(row('Wien')).toHaveFocus();
    expect(row('Wien')).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}');
    expect(row('Rückreise')).toHaveFocus();
    await user.keyboard('{Home}');
    expect(row('Hinreise')).toHaveFocus();

    // Left closes the group; its stage is then skipped.
    await user.keyboard('{ArrowLeft}');
    expect(row('Hinreise')).toHaveAttribute('aria-expanded', 'false');
    await user.keyboard('{ArrowDown}');
    expect(row('Rückreise')).toHaveFocus();
  });

  it('remembers the selection and the closed items for the next visit', async () => {
    const outward = addGroup(createProject('Trip'), 'Hinreise');
    const project = addEtappe(outward.project, outward.id, 'Wien').project;
    const { user } = renderEditor(project);
    await focusRow('Hinreise');
    await user.keyboard('{ArrowLeft}');
    expect(row('Hinreise')).toHaveAttribute('aria-expanded', 'false');

    cleanup();
    renderEditor(project);
    const group = await screen.findByRole('treeitem', { name: 'Hinreise' });
    expect(group).toHaveAttribute('aria-selected', 'true');
    expect(group).toHaveAttribute('aria-expanded', 'false');
  });

  it('asks before deleting a group and can undo it', async () => {
    const project = createProject('Trip');
    project.groups.push({ id: 'g_1', name: 'Hinreise', etappen: [] });
    const { user } = renderEditor(project);

    await focusRow('Hinreise');
    await user.keyboard('{Delete}');
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('„Hinreise“ löschen?');
    await user.click(within(dialog).getByRole('button', { name: 'Löschen' }));
    expect(screen.queryByRole('tree')).toBeNull();

    await user.click(screen.getByRole('button', { name: /Rückgängig/ }));
    expect(row('Hinreise')).toBeInTheDocument();
  });

  it('saves changes to the server on its own', async () => {
    const project = createProject('Trip');
    const { server, user } = renderEditor(project);
    await screen.findByRole('heading', { name: 'Trip' });

    await user.click(screen.getByRole('button', { name: /Gruppe/ }));
    await user.keyboard('{Enter}');

    await waitFor(() => expect(server.projects.get(project.id)?.groups).toHaveLength(1), {
      timeout: 3000,
    });
    expect(screen.getByRole('status')).toHaveTextContent('Gespeichert');
  });
});
