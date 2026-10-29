import {
  addEtappe,
  addGroup,
  addTrack,
  compileTimeline,
  createProject,
  editTrack,
  type TrackTiming,
} from '@travel-route-animator/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, createQueryClient } from '@/AppProviders';
import { EditorScreen } from '@/features/editor/EditorScreen';
import { installFakeServer } from '@/test/fakeServer';

const LANE_WIDTH_PX = 500;

/** A stage with a car labelled "Auto", timed as given. */
function trip(timing: Partial<TrackTiming>) {
  const outward = addGroup(createProject('Trip'), 'Hinreise');
  const stage = addEtappe(outward.project, outward.id, 'Wien – Porto');
  const car = addTrack(stage.project, stage.id, 'car', { label: 'Auto' });
  const project = editTrack(car.project, car.id, (t) => ({
    ...t,
    timing: { ...t.timing, ...timing },
  }));
  const { introSec, mainSec, outroSec } = compileTimeline(project, stage.id);
  return { project, pxPerSec: LANE_WIDTH_PX / (introSec + mainSec + outroSec) };
}

async function renderTimeline(project: ReturnType<typeof trip>['project']) {
  installFakeServer([project]);
  render(
    <AppProviders queryClient={createQueryClient()}>
      <EditorScreen projectId={project.id} />
    </AppProviders>,
  );
  // Selecting the vehicle shows its stage in the timeline (focus, see EditorScreen.test.tsx).
  const row = await screen.findByRole('treeitem', { name: /Auto/ });
  act(() => row.focus());
  return {
    bar: await screen.findByRole('slider', { name: 'Zeitraum von Auto' }),
    user: userEvent.setup(),
  };
}

/** jsdom lays nothing out; the lanes get a width so that pixels turn into seconds. */
function giveLanesAWidth() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    DOMRect.fromRect({ x: 0, y: 0, width: LANE_WIDTH_PX, height: 24 }),
  );
}

function drag(element: Element, byPx: number, steps = 4) {
  fireEvent.pointerDown(element, { button: 0, pointerId: 1, clientX: 100 });
  for (let step = 1; step <= steps; step += 1) {
    fireEvent.pointerMove(element, { pointerId: 1, clientX: 100 + (byPx * step) / steps });
  }
  fireEvent.pointerUp(element, { pointerId: 1, clientX: 100 + byPx });
}

const undo = (user: ReturnType<typeof userEvent.setup>) => user.keyboard('{Control>}z{/Control}');

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Timeline', () => {
  it('moves a bar by dragging and takes the whole drag back with one undo', async () => {
    const { project, pxPerSec } = trip({ startOffsetSec: 2, durationSec: 4 });
    const { bar, user } = await renderTimeline(project);
    giveLanesAWidth();
    expect(bar).toHaveAttribute('aria-valuetext', 'von 2,0 s bis 6,0 s');

    drag(bar, 1.5 * pxPerSec);
    expect(bar).toHaveAttribute('aria-valuetext', 'von 3,5 s bis 7,5 s');

    await undo(user);
    expect(bar).toHaveAttribute('aria-valuetext', 'von 2,0 s bis 6,0 s');
  });

  it('keeps two drags in a row as two undo steps', async () => {
    const { project, pxPerSec } = trip({ startOffsetSec: 2, durationSec: 4 });
    const { bar, user } = await renderTimeline(project);
    giveLanesAWidth();

    drag(bar, pxPerSec);
    drag(bar, pxPerSec);
    expect(bar).toHaveAttribute('aria-valuenow', '4');
    await undo(user);
    expect(bar).toHaveAttribute('aria-valuenow', '3');
  });

  it('gives a track that drove until the end its own duration at the right edge', async () => {
    const { project, pxPerSec } = trip({ startOffsetSec: 1 });
    const { bar } = await renderTimeline(project);
    giveLanesAWidth();
    expect(bar).toHaveAttribute('aria-valuetext', 'von 1,0 s bis zum Etappenende');

    drag(bar.querySelector('[data-handle="end"]')!, -2 * pxPerSec);
    expect(bar.getAttribute('aria-valuetext')).toMatch(/^von 1,0 s bis \d+,\d s$/);
  });

  it('moves the start and keeps the end at the left edge', async () => {
    const { project, pxPerSec } = trip({ startOffsetSec: 2, durationSec: 4 });
    const { bar } = await renderTimeline(project);
    giveLanesAWidth();

    drag(bar.querySelector('[data-handle="start"]')!, -1 * pxPerSec);
    expect(bar).toHaveAttribute('aria-valuetext', 'von 1,0 s bis 6,0 s');
  });

  it('nudges a focused bar with the arrow keys, one undo step per press', async () => {
    const { project } = trip({ startOffsetSec: 2, durationSec: 4 });
    const { bar, user } = await renderTimeline(project);
    act(() => bar.focus());

    await user.keyboard('{ArrowRight}');
    expect(bar).toHaveAttribute('aria-valuenow', '2.1');
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
    expect(bar).toHaveAttribute('aria-valuenow', '3.1');
    await user.keyboard('{ArrowLeft}');
    expect(bar).toHaveAttribute('aria-valuenow', '3');

    await undo(user);
    expect(bar).toHaveAttribute('aria-valuenow', '3.1');
    await undo(user);
    expect(bar).toHaveAttribute('aria-valuenow', '2.1');
  });

  it('asks for a stage while a group is selected', async () => {
    const { project } = trip({});
    installFakeServer([project]);
    render(
      <AppProviders queryClient={createQueryClient()}>
        <EditorScreen projectId={project.id} />
      </AppProviders>,
    );
    const group = await screen.findByRole('treeitem', { name: /Hinreise/ });
    act(() => group.focus());
    expect(screen.getByText(/um seine Timeline zu sehen/)).toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });
});
