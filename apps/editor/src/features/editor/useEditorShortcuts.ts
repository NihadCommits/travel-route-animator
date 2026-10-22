import { useEffect } from 'react';
import { useEditor } from '@/state/editorStore';

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

/** Editor-wide keyboard shortcuts. Shortcuts on a single tree row live in TreeRow. */
export function useEditorShortcuts() {
  const undo = useEditor((state) => state.undo);
  const redo = useEditor((state) => state.redo);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || isInFieldOrDialog(event.target)) return;
      const step = historyShortcut(event);
      if (!step) return;
      event.preventDefault();
      if (step === 'undo') undo();
      else redo();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);
}
