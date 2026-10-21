import { createProject } from '@travel-route-animator/core';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, createQueryClient } from '@/AppProviders';
import { installFakeServer } from '@/test/fakeServer';
import { ProjectOverview } from './ProjectOverview';

function renderOverview() {
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false } });
  return render(
    <AppProviders queryClient={queryClient}>
      <ProjectOverview />
    </AppProviders>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = '';
});

describe('ProjectOverview', () => {
  it('lists the projects with their last change', async () => {
    const project = { ...createProject('Portugal 2026'), updatedAt: '2026-10-21T11:44:00.000Z' };
    installFakeServer([project]);
    renderOverview();

    const link = await screen.findByRole('link', { name: /Portugal 2026/ });
    expect(link).toHaveAttribute('href', `#/projekt/${project.id}`);
    expect(within(link).getByText(/Zuletzt geändert 21\.10\.2026/)).toBeInTheDocument();
  });

  it('explains what to do when there are no projects yet', async () => {
    installFakeServer();
    renderOverview();
    expect(await screen.findByText(/Noch keine Projekte/)).toBeInTheDocument();
  });

  it('says so when the server is not running', async () => {
    installFakeServer().goOffline();
    renderOverview();
    expect(await screen.findByRole('alert')).toHaveTextContent('Läuft „pnpm dev“?');
  });

  it('creates a project and opens it', async () => {
    const server = installFakeServer();
    const user = userEvent.setup();
    renderOverview();

    await user.click(await screen.findByRole('button', { name: /Neues Projekt/ }));
    await user.type(screen.getByLabelText('Name'), 'Testreise');
    await user.click(screen.getByRole('button', { name: 'Anlegen' }));

    await waitFor(() => expect(window.location.hash).toMatch(/^#\/projekt\/p_/));
    expect(server.calls).toContainEqual({
      method: 'POST',
      path: '/projects',
      body: { name: 'Testreise' },
    });
  });

  it('refuses an empty name with a German message', async () => {
    const server = installFakeServer();
    const user = userEvent.setup();
    renderOverview();

    await user.click(await screen.findByRole('button', { name: /Neues Projekt/ }));
    await user.type(screen.getByLabelText('Name'), '   ');
    await user.click(screen.getByRole('button', { name: 'Anlegen' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Bitte einen Namen eingeben.');
    expect(server.calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('renames a project by saving the full project', async () => {
    const project = createProject('Alt');
    const server = installFakeServer([project]);
    const user = userEvent.setup();
    renderOverview();

    await user.click(await screen.findByRole('button', { name: 'Aktionen: Alt' }));
    await user.click(screen.getByRole('menuitem', { name: 'Umbenennen' }));
    const input = screen.getByLabelText('Name');
    await user.clear(input);
    await user.type(input, 'Neu');
    await user.click(screen.getByRole('button', { name: 'Umbenennen' }));

    expect(await screen.findByRole('link', { name: /Neu/ })).toBeInTheDocument();
    expect(server.projects.get(project.id)?.name).toBe('Neu');
  });

  it('asks before moving a project to the trash', async () => {
    const project = createProject('Weg damit');
    const server = installFakeServer([project]);
    const user = userEvent.setup();
    renderOverview();

    await user.click(await screen.findByRole('button', { name: 'Aktionen: Weg damit' }));
    await user.click(screen.getByRole('menuitem', { name: 'Löschen' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('„Weg damit“ löschen?');
    expect(dialog).toHaveTextContent('Papierkorb');

    await user.click(within(dialog).getByRole('button', { name: 'Löschen' }));
    expect(await screen.findByText(/Noch keine Projekte/)).toBeInTheDocument();
    expect(server.projects.size).toBe(0);
  });
});
