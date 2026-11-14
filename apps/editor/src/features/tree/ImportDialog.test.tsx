import { addEtappe, addGroup, createProject, type Project } from '@travel-route-animator/core';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, createQueryClient } from '@/AppProviders';
import { EditorScreen } from '@/features/editor/EditorScreen';
import { installFakeServer } from '@/test/fakeServer';

/** A short ride east with heights, a 10-minute break in the middle and a named bridge. */
function ride(): string {
  const points: string[] = [];
  let time = Date.UTC(2026, 6, 4, 8);
  for (let i = 0; i <= 40; i++) {
    const lon = (13 + i * 0.0005).toFixed(6);
    points.push(
      `<trkpt lat="47.8" lon="${lon}"><ele>${400 + i}</ele><time>${new Date(time).toISOString()}</time></trkpt>`,
    );
    time += i === 20 ? 10 * 60 * 1000 : 5000;
    if (i === 20) {
      points.push(
        `<trkpt lat="47.8" lon="${lon}"><ele>${400 + i}</ele><time>${new Date(time).toISOString()}</time></trkpt>`,
      );
    }
  }
  return `<gpx><wpt lat="47.8001" lon="13.0150"><name>Brücke</name></wpt><trk><name>Morgenrunde</name><type>cycling</type><trkseg>${points.join('')}</trkseg></trk></gpx>`;
}

function stage(): Project {
  const group = addGroup(createProject('Trip'), 'Tag 1');
  return addEtappe(group.project, group.id, 'Radtour').project;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('importing a track', () => {
  it('turns a GPX file into a vehicle on the imported line, with the suggested stops', async () => {
    const project = stage();
    installFakeServer([project]);
    render(
      <AppProviders queryClient={createQueryClient()}>
        <EditorScreen projectId={project.id} />
      </AppProviders>,
    );
    await screen.findByRole('heading', { level: 1, name: project.name });
    const user = userEvent.setup();

    const row = await screen.findByRole('treeitem', { name: 'Radtour' });
    act(() => row.focus());
    await user.click(within(row).getByRole('button', { name: '+ Fahrzeug' }));
    await user.click(screen.getByRole('button', { name: 'Aus Datei importieren (GPX, DJI) …' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Track importieren' }));
    const file = new File([ride()], 'morgenrunde.gpx', { type: 'application/gpx+xml' });
    await user.upload(dialog.getByLabelText('Datei (.gpx oder .srt)'), file);

    expect(
      await dialog.findByText(/„Morgenrunde“: 1,5 km aus 42 Punkten, mit Höhen\./),
    ).toBeInTheDocument();
    expect(dialog.getByRole('combobox', { name: 'Fahrzeug' })).toHaveDisplayValue('Fahrrad');
    expect(
      dialog.getByRole('switch', { name: '2 Stopps vorschlagen (Pausen, Wegpunkte)' }),
    ).toBeChecked();
    await user.click(dialog.getByRole('button', { name: 'Importieren' }));

    // The new vehicle is in the tree and selected, its route along the file.
    const track = await screen.findByRole('treeitem', { name: /Morgenrunde/ });
    expect(track).toBeInTheDocument();
    const inspector = within(screen.getByRole('region', { name: 'Eigenschaften' }));
    await waitFor(() =>
      expect(inspector.getByText(/Linie aus „Morgenrunde“ \(GPX\)/)).toBeInTheDocument(),
    );
    expect(inspector.getByRole('combobox', { name: 'Routing' })).toHaveDisplayValue('GPX-Datei');
  });

  it('says why a file cannot be read', async () => {
    const project = stage();
    installFakeServer([project]);
    render(
      <AppProviders queryClient={createQueryClient()}>
        <EditorScreen projectId={project.id} />
      </AppProviders>,
    );
    await screen.findByRole('heading', { level: 1, name: project.name });
    const user = userEvent.setup();
    const row = await screen.findByRole('treeitem', { name: 'Radtour' });
    act(() => row.focus());
    await user.click(within(row).getByRole('button', { name: '+ Fahrzeug' }));
    await user.click(screen.getByRole('button', { name: 'Aus Datei importieren (GPX, DJI) …' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Track importieren' }));
    await user.upload(
      dialog.getByLabelText('Datei (.gpx oder .srt)'),
      new File(['<kml/>'], 'falsch.gpx'),
    );
    expect(await dialog.findByRole('alert')).toHaveTextContent(/This is not a GPX file/);
    expect(dialog.getByRole('button', { name: 'Importieren' })).toBeDisabled();
  });
});
