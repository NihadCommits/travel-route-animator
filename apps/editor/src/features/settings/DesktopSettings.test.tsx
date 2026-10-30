import type { DesktopBridge, DesktopSettings } from '@travel-route-animator/core';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, createQueryClient } from '@/AppProviders';
import { App } from '@/App';
import { installFakeServer } from '@/test/fakeServer';

const SETTINGS: DesktopSettings = {
  orsApiKeySet: true,
  serviceContact: 'https://github.com/NihadCommits',
  outputDir: 'C:\\Users\\n\\Videos\\Routen-Animator',
  defaultOutputDir: 'C:\\Users\\n\\Videos\\Routen-Animator',
  dataDir: 'C:\\Users\\n\\AppData\\Roaming\\Routen-Animator\\data',
  renderGl: 'angle',
  renderGlOptions: ['angle', 'vulkan', 'swiftshader'],
};

/** What the app's preload would offer, with the calls recorded. */
function fakeBridge(): DesktopBridge & { openFromMenu: () => void } {
  let menuListener: (() => void) | undefined;
  return {
    getSettings: vi.fn(() => Promise.resolve(SETTINGS)),
    updateSettings: vi.fn(() => Promise.resolve(SETTINGS)),
    chooseFolder: vi.fn(() => Promise.resolve('D:\\Schnitt\\Karten')),
    importProjects: vi.fn(() => Promise.resolve(null)),
    onOpenSettings: (listener) => {
      menuListener = listener;
      return () => (menuListener = undefined);
    },
    openFromMenu: () => menuListener?.(),
  };
}

function renderApp() {
  installFakeServer([]);
  render(
    <AppProviders queryClient={createQueryClient()}>
      <App />
    </AppProviders>,
  );
  return userEvent.setup();
}

const dialog = () => within(screen.getByRole('dialog', { name: 'Einstellungen' }));

afterEach(() => {
  delete window.desktop;
  vi.unstubAllGlobals();
});

describe('desktop settings', () => {
  it('are not there in the browser version', async () => {
    renderApp();
    await screen.findByRole('heading', { name: 'Projekte' });
    expect(screen.queryByRole('button', { name: /Einstellungen/ })).not.toBeInTheDocument();
  });

  it('change only what was edited, and never show the stored key', async () => {
    const bridge = fakeBridge();
    window.desktop = bridge;
    const user = renderApp();
    await user.click(await screen.findByRole('button', { name: /Einstellungen/ }));
    expect(await dialog().findByText(/Ein Key ist gespeichert/)).toBeInTheDocument();
    expect(dialog().getByLabelText('openrouteservice-Key')).toHaveValue('');

    await user.click(dialog().getByRole('button', { name: /Ändern/ }));
    await waitFor(() => expect(dialog().getByText('D:\\Schnitt\\Karten')).toBeInTheDocument());
    await user.selectOptions(
      dialog().getByRole('combobox', { name: /Grafik beim Rendern/ }),
      'vulkan',
    );
    await user.click(dialog().getByRole('button', { name: 'Speichern' }));

    await waitFor(() =>
      expect(bridge.updateSettings).toHaveBeenCalledWith({
        outputDir: 'D:\\Schnitt\\Karten',
        renderGl: 'vulkan',
      }),
    );
  });

  it('opens from the app menu, sends a new key and removes it on request', async () => {
    const bridge = fakeBridge();
    window.desktop = bridge;
    const user = renderApp();
    await screen.findByRole('heading', { name: 'Projekte' });
    act(() => bridge.openFromMenu());

    await user.type(await dialog().findByLabelText('openrouteservice-Key'), ' neuer-key ');
    await user.click(dialog().getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(bridge.updateSettings).toHaveBeenLastCalledWith({ orsApiKey: 'neuer-key' }),
    );

    act(() => bridge.openFromMenu());
    await user.click(await dialog().findByRole('button', { name: 'Key entfernen' }));
    await user.click(dialog().getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(bridge.updateSettings).toHaveBeenLastCalledWith({ orsApiKey: null }),
    );
  });

  it('says why the app refused, e.g. while a video renders', async () => {
    const bridge = fakeBridge();
    bridge.updateSettings = vi.fn(() =>
      Promise.reject(
        new Error(
          "Error invoking remote method 'settings:update': Error: Während ein Video rendert, lassen sich die Einstellungen nicht ändern.",
        ),
      ),
    );
    window.desktop = bridge;
    const user = renderApp();
    await user.click(await screen.findByRole('button', { name: /Einstellungen/ }));
    await user.type(await dialog().findByLabelText('Kontakt für freie Dienste'), '/x');
    await user.click(dialog().getByRole('button', { name: 'Speichern' }));
    expect(await dialog().findByRole('alert')).toHaveTextContent(
      'Nicht gespeichert: Während ein Video rendert, lassen sich die Einstellungen nicht ändern.',
    );
  });
});
