import { addEtappe, addGroup, addTrack, createProject } from '@travel-route-animator/core';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, createQueryClient } from '@/AppProviders';
import { EditorScreen } from '@/features/editor/EditorScreen';
import {
  leavesKeyToEditor,
  playbackShortcut,
  workspaceShortcut,
} from '@/features/editor/useEditorShortcuts';
import { installFakeServer } from '@/test/fakeServer';

// The player itself is replaced in test/setup.ts (no WebGL in jsdom); what remains is how the
// editor gets into the preview and back, and which stage it shows.

async function renderEditor() {
  const outward = addGroup(createProject('Trip'), 'Hinreise');
  const stage = addEtappe(outward.project, outward.id, 'Wien – Porto');
  const { project } = addTrack(stage.project, stage.id, 'car', { label: 'Auto' });
  installFakeServer([project]);
  render(
    <AppProviders queryClient={createQueryClient()}>
      <EditorScreen projectId={project.id} />
    </AppProviders>,
  );
  await screen.findByRole('heading', { level: 1, name: 'Trip' });
  return { etappeId: stage.id, groupId: outward.id, user: userEvent.setup() };
}

const switchButton = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });

async function focusRow(name: RegExp) {
  const row = await screen.findByRole('treeitem', { name });
  act(() => row.focus());
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Preview', () => {
  it('switches with V and B and shows the stage of the selected vehicle', async () => {
    const { etappeId, user } = await renderEditor();
    await focusRow(/Auto/);
    expect(switchButton('Bearbeiten')).toHaveAttribute('aria-pressed', 'true');

    await user.keyboard('v');
    expect(await screen.findByText(`Vorschau-Player für ${etappeId}`)).toBeInTheDocument();
    expect(switchButton('Vorschau')).toHaveAttribute('aria-pressed', 'true');

    await user.keyboard('b');
    expect(switchButton('Bearbeiten')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText(/Vorschau-Player/)).not.toBeInTheDocument();
  });

  it('switches with the buttons in the header and plays a whole group', async () => {
    const { groupId, user } = await renderEditor();
    await focusRow(/Hinreise/);
    await user.click(switchButton('Vorschau'));
    expect(await screen.findByText(`Vorschau-Player für ${groupId}`)).toBeInTheDocument();
  });

  it('leaves the letters to a text field', async () => {
    const { user } = await renderEditor();
    await focusRow(/Auto/);
    const name = screen.getByRole('textbox', { name: 'Bezeichnung' });
    act(() => name.focus());
    await user.keyboard('v');
    expect(switchButton('Bearbeiten')).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('editor shortcuts', () => {
  const keys = (key: string, more: Partial<KeyboardEvent> = {}) => ({
    key,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...more,
  });

  it('reads B, V, space and the arrows, but not with Ctrl or Alt', () => {
    expect(workspaceShortcut(keys('B'))).toBe('edit');
    expect(workspaceShortcut(keys('v'))).toBe('preview');
    expect(workspaceShortcut(keys('v', { ctrlKey: true }))).toBeNull();
    expect(playbackShortcut(keys(' '), 25)).toEqual({ kind: 'toggle' });
    expect(playbackShortcut(keys('ArrowLeft'), 25)).toEqual({ kind: 'step', frames: -1 });
    expect(playbackShortcut(keys('ArrowRight', { shiftKey: true }), 25)).toEqual({
      kind: 'step',
      frames: 25,
    });
    expect(playbackShortcut(keys('ArrowRight', { altKey: true }), 25)).toBeNull();
  });

  it('leaves keys to the element that already uses them', () => {
    document.body.innerHTML = `
      <input id="field" />
      <button id="button">Knopf</button>
      <ul role="tree"><li role="treeitem" id="row" tabindex="0">Etappe</li></ul>
      <div role="slider" id="bar" tabindex="0"></div>
      <div role="separator" id="handle" tabindex="0"></div>
      <div id="plain"></div>`;
    const element = (id: string) => document.getElementById(id);

    expect(leavesKeyToEditor(element('field'), 'v')).toBe(false);
    expect(leavesKeyToEditor(element('plain'), ' ')).toBe(true);
    // Space presses a focused button, the arrows move through the tree, bars and panels.
    expect(leavesKeyToEditor(element('button'), ' ')).toBe(false);
    expect(leavesKeyToEditor(element('button'), 'ArrowLeft')).toBe(true);
    expect(leavesKeyToEditor(element('row'), 'ArrowRight')).toBe(false);
    expect(leavesKeyToEditor(element('bar'), 'ArrowRight')).toBe(false);
    expect(leavesKeyToEditor(element('handle'), 'ArrowLeft')).toBe(false);
    // The letters still work on a tree row.
    expect(leavesKeyToEditor(element('row'), 'v')).toBe(true);
    expect(leavesKeyToEditor(document.body, 'ArrowLeft')).toBe(true);
  });
});
