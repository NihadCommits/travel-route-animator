import {
  addEtappe,
  addGroup,
  addTrack,
  createProject,
  createWaypoint,
  editTrack,
  type Project,
  type RenderJob,
  type RenderRequest,
  type VehicleType,
} from '@travel-route-animator/core';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, createQueryClient } from '@/AppProviders';
import { EditorScreen } from '@/features/editor/EditorScreen';
import { fakeRenderJob, installFakeServer, type FakeSearch } from '@/test/fakeServer';

/** Stands in for the browser's EventSource; tests send the server's events themselves. */
class FakeEventSource {
  static open: FakeEventSource[] = [];
  onerror: (() => void) | null = null;
  closed = false;
  private listeners: ((event: { data: string }) => void)[] = [];
  constructor(readonly url: string) {
    FakeEventSource.open.push(this);
  }
  addEventListener(_type: 'job', listener: (event: { data: string }) => void) {
    this.listeners.push(listener);
  }
  close() {
    this.closed = true;
  }
  send(job: RenderJob) {
    act(() => this.listeners.forEach((listener) => listener({ data: JSON.stringify(job) })));
  }
}

/** A stage "Wien – Porto" with one vehicle that has both its stops. */
function trip(vehicle: VehicleType = 'plane') {
  const outward = addGroup(createProject('Portugal 2026'), 'Hinreise');
  const stage = addEtappe(outward.project, outward.id, 'Wien – Porto');
  const added = addTrack(stage.project, stage.id, vehicle, {
    label: vehicle === 'plane' ? 'Flug' : 'Auto',
  });
  const project = editTrack(added.project, added.id, (track) => ({
    ...track,
    waypoints: [
      createWaypoint({ name: 'Wien', lngLat: [16.57, 48.11] }),
      createWaypoint({ name: 'Porto', lngLat: [-8.68, 41.25] }),
    ],
  }));
  return { project, etappeId: stage.id };
}

async function renderEditor(
  project: Project,
  services: FakeSearch = {},
  renders: RenderJob[] = [],
) {
  const server = installFakeServer([project], services);
  // On the server before the editor asks for the list.
  server.renders.push(...renders);
  render(
    <AppProviders queryClient={createQueryClient()}>
      <EditorScreen projectId={project.id} />
    </AppProviders>,
  );
  await screen.findByRole('heading', { level: 1, name: project.name });
  return { server, user: userEvent.setup() };
}

/** Selects a tree row the way focusing it does in the browser (see EditorScreen.test.tsx). */
async function selectRow(name: RegExp) {
  const row = await screen.findByRole('treeitem', { name });
  act(() => row.focus());
}

const renderButton = () => screen.getByRole('button', { name: /^Rendern$/ });
// By name: the render list's popover is a dialog too.
const dialog = () => within(screen.getByRole('dialog', { name: 'Rendern' }));

beforeEach(() => {
  FakeEventSource.open = [];
  vi.stubGlobal('EventSource', FakeEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('render dialog', () => {
  it('needs a stage, a vehicle or a group with stages to render', async () => {
    const { project } = trip();
    const empty = addGroup(project, 'Rückreise').project;
    await renderEditor(empty);
    expect(renderButton()).toBeDisabled();
    await selectRow(/Rückreise/);
    expect(renderButton()).toBeDisabled();
    await selectRow(/Hinreise/);
    expect(renderButton()).toBeEnabled();
    await selectRow(/Flug/);
    expect(renderButton()).toBeEnabled();
  });

  it('renders a whole group as one video, or its stages one by one', async () => {
    // A second stage: the same flight back.
    const { project } = trip();
    const group = project.groups[0]!;
    const second = addEtappe(project, group.id, 'Porto – Wien');
    const added = addTrack(second.project, second.id, 'plane', { label: 'Rückflug' });
    const both = editTrack(added.project, added.id, (track) => ({
      ...track,
      waypoints: [
        createWaypoint({ name: 'Porto', lngLat: [-8.68, 41.25] }),
        createWaypoint({ name: 'Wien', lngLat: [16.57, 48.11] }),
      ],
    }));
    const { server, user } = await renderEditor(both);
    await selectRow(/Hinreise/);
    await user.click(renderButton());
    expect(dialog().getByText('Gruppe „Hinreise“ mit 2 Etappen')).toBeInTheDocument();
    const target = dialog().getByLabelText('Was gerendert wird');
    expect(target).toHaveDisplayValue('Ganze Gruppe als ein Video');
    // No stage is selected, so "only this stage" is not on offer.
    expect(within(target).getByRole('option', { name: 'Nur diese Etappe' })).toBeDisabled();
    expect(dialog().getByLabelText<HTMLInputElement>('Dateiname').value).toMatch(
      /^hinreise_16x9_1080p_/,
    );
    await user.click(dialog().getByRole('button', { name: 'Rendern' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Rendern' })).toBeNull());
    const posts = () =>
      server.calls.filter((call) => call.method === 'POST' && call.path === '/render');
    expect(posts().map((call) => call.body)).toEqual([
      expect.objectContaining({ etappeIds: [group.etappen[0]!.id, second.id] }),
    ]);

    await user.click(renderButton());
    await user.selectOptions(
      dialog().getByLabelText('Was gerendert wird'),
      'Etappen der Gruppe einzeln',
    );
    expect(dialog().queryByLabelText('Dateiname')).toBeNull();
    await user.click(dialog().getByRole('button', { name: 'Rendern' }));
    await waitFor(() => expect(posts()).toHaveLength(3));
    expect(
      posts()
        .slice(1)
        .map((call) => (call.body as RenderRequest).etappeId),
    ).toEqual([group.etappen[0]!.id, second.id]);
  });

  it('saves first, then asks the server with this render’s format and file name', async () => {
    const { project, etappeId } = trip();
    const { server, user } = await renderEditor(project);
    await selectRow(/Flug/);
    // An edit the autosave has not written yet: the server must not render without it.
    const label = screen.getByRole('textbox', { name: 'Bezeichnung' });
    act(() => label.focus());
    await user.keyboard('{Control>}a{/Control}Flug nach Porto{Enter}');
    await user.click(renderButton());

    const name = dialog().getByRole('textbox', { name: 'Dateiname' });
    expect((name as HTMLInputElement).value).toMatch(/^wien-porto_16x9_1080p_\d{8}-\d{4}$/);
    await user.selectOptions(dialog().getByRole('combobox', { name: 'Seitenverhältnis' }), '9:16');
    // The suggestion follows the format until the name is typed by hand.
    expect((name as HTMLInputElement).value).toMatch(/^wien-porto_9x16_1080p_/);
    await user.click(dialog().getByRole('button', { name: 'Rendern' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Rendern' })).not.toBeInTheDocument(),
    );
    const order = server.calls.map((call) => `${call.method} ${call.path}`);
    expect(order.indexOf(`PUT /projects/${project.id}`)).toBeGreaterThanOrEqual(0);
    expect(order.indexOf(`PUT /projects/${project.id}`)).toBeLessThan(
      order.indexOf('POST /render'),
    );
    const sent = server.calls.find((call) => call.method === 'POST' && call.path === '/render');
    expect(sent?.body).toMatchObject({
      projectId: project.id,
      etappeId,
      output: { aspect: '9:16', resolution: '1080p', fps: 25 },
      fileName: expect.stringMatching(/^wien-porto_9x16_1080p_/) as string,
    } satisfies Partial<RenderRequest>);
    // The project itself keeps its 16:9 default.
    expect(server.projects.get(project.id)?.defaults.output.aspect).toBe('16:9');
    // The list opens and shows the new job.
    expect(await screen.findByText(/^wien-porto_9x16_1080p_.*\.mp4$/)).toBeInTheDocument();
  });

  it('fills the format from a preset and renders a transparent overlay', async () => {
    const { project } = trip();
    const { server, user } = await renderEditor(project);
    await selectRow(/Flug/);
    await user.click(renderButton());
    const preset = dialog().getByRole('combobox', { name: 'Vorlage' });
    const overlay = dialog().getByRole('switch', { name: 'Transparentes Overlay' });
    // H.264 has no alpha channel, so it cannot be an overlay.
    expect(overlay).toBeDisabled();
    expect(preset).toHaveDisplayValue('YouTube 1080p 25p');

    await user.selectOptions(preset, 'Reel 1080×1920 30p');
    expect(dialog().getByRole('combobox', { name: 'Seitenverhältnis' })).toHaveDisplayValue(
      '9:16 (Hochformat)',
    );
    await user.selectOptions(preset, 'Overlay ProRes 4444 (transparent)');
    expect(overlay).toBeChecked();
    expect(dialog().getByText(/Landet als \.mov in output\/portugal-2026\//)).toBeInTheDocument();
    await user.click(dialog().getByRole('button', { name: 'Rendern' }));

    await waitFor(() =>
      expect(server.calls.some((call) => call.method === 'POST' && call.path === '/render')).toBe(
        true,
      ),
    );
    const sent = server.calls.find((call) => call.method === 'POST' && call.path === '/render');
    expect(sent?.body).toMatchObject({
      output: { aspect: '16:9', fps: 25, codec: 'prores-4444', transparentOverlay: true },
    });
  });

  it('queues every group of the project, also in extra formats, in one go', async () => {
    const { project } = trip();
    // A second group "Rückreise" with a flight of its own.
    const back = addGroup(project, 'Rückreise');
    const stage = addEtappe(back.project, back.id, 'Porto – Wien');
    const flight = addTrack(stage.project, stage.id, 'plane', { label: 'Rückflug' });
    const both = editTrack(flight.project, flight.id, (track) => ({
      ...track,
      waypoints: [
        createWaypoint({ name: 'Porto', lngLat: [-8.68, 41.25] }),
        createWaypoint({ name: 'Wien', lngLat: [16.57, 48.11] }),
      ],
    }));
    const { server, user } = await renderEditor(both);
    await selectRow(/^Flug/);
    await user.click(renderButton());
    await user.selectOptions(
      dialog().getByRole('combobox', { name: 'Was gerendert wird' }),
      'Ganzes Projekt: jede Gruppe als ein Video',
    );
    expect(
      dialog().getByText('2 Dateien, je nach ihrer Gruppe benannt.', { exact: false }),
    ).toBeInTheDocument();
    await user.click(dialog().getByRole('switch', { name: 'Reel 1080×1920 30p' }));
    expect(dialog().getByText('4 Aufträge für die Warteschlange.')).toBeInTheDocument();
    await user.click(dialog().getByRole('button', { name: 'Rendern' }));

    await waitFor(() =>
      expect(server.calls.filter((c) => c.method === 'POST' && c.path === '/render')).toHaveLength(
        4,
      ),
    );
    const sent = server.calls
      .filter((c) => c.method === 'POST' && c.path === '/render')
      .map((c) => c.body as RenderRequest);
    expect(sent.map((r) => [r.etappeId ?? r.etappeIds, r.output?.aspect])).toEqual([
      [expect.any(String), '16:9'],
      [expect.any(String), '9:16'],
      [stage.id, '16:9'],
      [stage.id, '9:16'],
    ]);
    // The server names each after its group and format.
    expect(sent.every((r) => r.fileName === undefined)).toBe(true);
  });

  it('turns the overlay off when the codec has no alpha channel', async () => {
    const { project } = trip();
    const { user } = await renderEditor(project);
    await selectRow(/Flug/);
    await user.click(renderButton());
    const codec = dialog().getByRole('combobox', { name: 'Codec' });
    await user.selectOptions(codec, 'PNG-Sequenz (Ordner, mit Alpha)');
    const overlay = dialog().getByRole('switch', { name: 'Transparentes Overlay' });
    await user.click(overlay);
    expect(overlay).toBeChecked();
    expect(dialog().getByText(/Landet als Ordner mit PNGs/)).toBeInTheDocument();
    expect(dialog().getByRole('combobox', { name: 'Vorlage' })).toHaveDisplayValue(
      'Eigene Einstellung',
    );
    await user.selectOptions(codec, 'ProRes 422 HQ (MOV)');
    expect(overlay).not.toBeChecked();
    expect(overlay).toBeDisabled();
  });

  it('waits for a road route the server could not compute, and says so', async () => {
    const { project } = trip('car');
    const { server, user } = await renderEditor(project);
    await selectRow(/Auto/);
    await user.click(renderButton());
    // The fake server has no ORS key, so the car's route fails.
    expect(await dialog().findByText(/Die Route von „Auto“ fehlt noch/)).toBeInTheDocument();
    expect(dialog().getByRole('button', { name: 'Rendern' })).toBeDisabled();
    expect(server.calls.some((call) => call.path === '/render' && call.method === 'POST')).toBe(
      false,
    );
  });

  it('explains when the server refuses the stage', async () => {
    const { project } = trip();
    const { user } = await renderEditor(project, {
      render: () => ({
        status: 409,
        body: {
          error: 'not_ready',
          message: 'not ready',
          issues: [
            {
              path: 'groups[0].etappen[0].tracks',
              code: 'etappe.noTracks',
              message: 'A stage needs at least one vehicle (track)',
              values: {},
            },
          ],
        },
      }),
    });
    await selectRow(/Flug/);
    await user.click(renderButton());
    await user.click(dialog().getByRole('button', { name: 'Rendern' }));
    expect(await dialog().findByRole('alert')).toHaveTextContent(/konnte nicht starten/);
  });
});

describe('render list', () => {
  async function openListWithJob(patch: Partial<RenderJob>, services: FakeSearch = {}) {
    const { project, etappeId } = trip();
    const request = { projectId: project.id, etappeId, output: {}, fileName: 'wien-porto' };
    const job = fakeRenderJob(request, patch);
    const result = await renderEditor(project, services, [job]);
    await result.user.click(screen.getByRole('button', { name: 'Render-Liste' }));
    await screen.findByText('wien-porto.mp4');
    return { ...result, job };
  }

  it('follows a running job until it is done, then lets go of the stream', async () => {
    const { job: started } = await openListWithJob({
      state: 'rendering',
      startedAt: '2026-10-29T15:30:00.000Z',
    });
    // The one still open (strict mode opens and closes a first one in development).
    const stream = FakeEventSource.open.findLast((source) => !source.closed);
    expect(stream?.url).toBe(`/api/render/${started.id}/events`);
    expect(screen.getByLabelText('1 läuft')).toBeInTheDocument();

    const job = { ...started, progress: 0.4, remainingMs: 12_000 };
    stream!.send(job);
    expect(await screen.findByText('Rendert 40 %')).toBeInTheDocument();
    expect(screen.getByText('noch etwa 12 s')).toBeInTheDocument();

    stream!.send({
      ...job,
      state: 'done',
      progress: 1,
      remainingMs: null,
      finishedAt: '2026-10-29T15:33:07.000Z',
      video: { width: 1920, height: 1080, fps: 25, durationSec: 10.04 },
    });
    expect(await screen.findByText('1920 × 1080 · 25 fps · 10,0 s')).toBeInTheDocument();
    expect(screen.getByText(/Fertig in 3:07 min/)).toBeInTheDocument();
    expect(FakeEventSource.open.every((source) => source.closed)).toBe(true);
    expect(screen.queryByLabelText('1 läuft')).not.toBeInTheDocument();
  });

  it('cancels a running job', async () => {
    const { server, user } = await openListWithJob({ state: 'rendering' });
    await user.click(screen.getByRole('button', { name: 'Abbrechen' }));
    await waitFor(() =>
      expect(
        server.calls.some((call) => call.method === 'DELETE' && call.path.startsWith('/render/')),
      ).toBe(true),
    );
  });

  it('copies the path, also when the folder cannot be opened', async () => {
    // userEvent.setup() puts its own clipboard in place, which the test can read back.
    const done = { state: 'done' as const, progress: 1 };
    const { user } = await openListWithJob(done, { revealStatus: 501 });
    const path = 'C:\\videos\\portugal-2026\\wien-porto.mp4';

    await user.click(screen.getByRole('button', { name: /Pfad kopieren/ }));
    expect(await navigator.clipboard.readText()).toBe(path);
    await navigator.clipboard.writeText('');
    await user.click(screen.getByRole('button', { name: /Ordner öffnen/ }));
    expect(await screen.findByText(/nur unter Windows/)).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(path);
  });
});
