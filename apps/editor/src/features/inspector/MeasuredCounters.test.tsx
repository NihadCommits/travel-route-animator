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
import { describe, expect, it } from 'vitest';
import { AppProviders, createQueryClient } from '@/AppProviders';
import { EditorScreen } from '@/features/editor/EditorScreen';
import { installFakeServer } from '@/test/fakeServer';

// Speed, heart rate and the clock at a stage (M16). A train has no recording: speed and heart
// rate say why they stay empty, and the clock runs from a typed departure.

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

describe('measured counters', () => {
  it('explain a missing recording and run the clock from a typed departure', async () => {
    const project = trip();
    const server = installFakeServer([project]);
    render(
      <AppProviders queryClient={createQueryClient()}>
        <EditorScreen projectId={project.id} />
      </AppProviders>,
    );
    await screen.findByRole('heading', { level: 1, name: project.name });
    const user = userEvent.setup();
    act(() => screen.getAllByRole('treeitem', { name: 'Salzburg – Linz' })[0]!.focus());
    const inspector = within(screen.getByRole('region', { name: 'Eigenschaften' }));

    await user.click(inspector.getByRole('switch', { name: 'Geschwindigkeit' }));
    expect(inspector.getByText(/Nur mit einer Aufzeichnung mit Zeitstempeln/)).toBeInTheDocument();

    await user.click(inspector.getByRole('switch', { name: 'Uhrzeit' }));
    const source = inspector.getByRole('combobox', { name: 'Uhrzeit aus' });
    expect(source).toHaveDisplayValue('Eingetragener Abfahrt');
    expect(within(source).getByRole('option', { name: 'Der Aufzeichnung' })).toBeDisabled();
    expect(inspector.getByText(/Trag die Abfahrt ein/)).toBeInTheDocument();

    fireEvent.change(inspector.getByLabelText('Abfahrt'), {
      target: { value: '2026-07-14T08:30' },
    });
    // A train has no router's travel time: the clock would stand still at the departure.
    expect(await inspector.findByText(/bleibt die Uhr bei der Abfahrt stehen/)).toBeInTheDocument();
    await waitFor(() => {
      const saved = server.projects.get(project.id)!.groups[0]!.etappen[0]!;
      expect(saved.clock).toMatchObject({ source: 'manual', departure: '2026-07-14T08:30' });
      expect(saved.overlays.clockCounter).toBe(true);
    });
  });
});
