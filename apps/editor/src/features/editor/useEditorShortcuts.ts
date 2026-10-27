import { useEffect } from 'react';
import type { PlayerBridge } from '@/features/preview/playerBridge';
import { useEditor, type Workspace } from '@/state/editorStore';

type ShortcutKeys = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>;

/** Which history step a key press asks for: Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y (Cmd on a Mac). */
export function historyShortcut(event: ShortcutKeys): 'undo' | 'redo' | null {
  // Alt is excluded because AltGr arrives as Ctrl+Alt on Windows.
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && !event.shiftKey) return 'redo';
  return null;
}

/**
 * B for Bearbeiten, V for Vorschau. Not Tab as first planned (UI-Konzept): Tab moves the
 * keyboard focus through the whole interface and has to keep doing that.
 */
export function workspaceShortcut(event: ShortcutKeys): Workspace | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === 'b') return 'edit';
  if (key === 'v') return 'preview';
  return null;
}

export type PlaybackShortcut = { kind: 'toggle' } | { kind: 'step'; frames: number };

/** Space plays and pauses, the arrows step a frame, with Shift a second. */
export function playbackShortcut(event: ShortcutKeys, fps: number): PlaybackShortcut | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (event.key === ' ') return { kind: 'toggle' };
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return null;
  const frames = event.shiftKey ? fps : 1;
  return { kind: 'step', frames: event.key === 'ArrowLeft' ? -frames : frames };
}

/**
 * Text fields keep their own undo for what is being typed, and an open dialog is about
 * something specific; undoing project changes underneath either would be a surprise.
 */
function isInFieldOrDialog(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.closest('input, textarea, select, [role="dialog"], [role="alertdialog"]') !== null)
  );
}

// Menus and lists jump to an entry by its first letter.
const LETTER_KEYS_TAKEN = '[role="menu"], [role="listbox"]';
// The space bar presses whatever button, switch or entry has the focus.
const SPACE_TAKEN =
  'button, a[href], summary, [role="button"], [role="checkbox"], [role="switch"], [role="radio"], [role="tab"], [role="menuitem"], [role="option"], [role="treeitem"], [role="slider"]';
// The arrows already move through the tree, nudge timeline bars and resize the panels.
const ARROWS_TAKEN =
  '[role="tree"], [role="slider"], [role="separator"], [role="menu"], [role="listbox"], [role="radiogroup"], [role="tablist"]';

/** Whether the element with the focus leaves this key to the editor-wide shortcuts. */
export function leavesKeyToEditor(target: EventTarget | null, key: string): boolean {
  if (isInFieldOrDialog(target)) return false;
  if (!(target instanceof Element)) return true;
  const taken =
    key === ' ' ? SPACE_TAKEN : key.startsWith('Arrow') ? ARROWS_TAKEN : LETTER_KEYS_TAKEN;
  return target.closest(taken) === null;
}

/**
 * Editor-wide keyboard shortcuts. Shortcuts on a single tree row live in TreeRow, those on a
 * timeline bar in useBarDrag.
 */
export function useEditorShortcuts(bridge: PlayerBridge) {
  const undo = useEditor((state) => state.undo);
  const redo = useEditor((state) => state.redo);
  const setWorkspace = useEditor((state) => state.setWorkspace);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || !leavesKeyToEditor(event.target, event.key)) return;
      const step = historyShortcut(event);
      if (step) {
        event.preventDefault();
        if (step === 'undo') undo();
        else redo();
        return;
      }
      const workspace = workspaceShortcut(event);
      if (workspace) {
        event.preventDefault();
        setWorkspace(workspace);
        return;
      }
      // Playback keys only while a preview is open.
      const attached = bridge.attached();
      const playback = attached && playbackShortcut(event, attached.fps);
      if (!playback) return;
      event.preventDefault();
      if (playback.kind === 'step') bridge.step(playback.frames);
      else if (!event.repeat) bridge.togglePlay();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, setWorkspace, bridge]);
}
