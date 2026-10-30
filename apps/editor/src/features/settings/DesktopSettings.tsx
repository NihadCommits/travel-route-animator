import type {
  DesktopBridge,
  DesktopSettings,
  DesktopSettingsPatch,
} from '@travel-route-animator/core';
import { FolderInput, FolderOpen, RotateCcw } from 'lucide-react';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SelectField } from '@/features/inspector/fields/SelectField';
import { de } from '@/i18n/de';
import { bridgeErrorMessage, desktopBridge } from '@/lib/desktop';

// The Windows app's settings (M7b): what the web version keeps in .env. Only there when the
// window runs inside the app; the browser version never shows any of it.

const OPEN_EVENT = 'tra:open-settings';

/** Opens the settings, e.g. from a button; the app's menu has its own way in. */
export function openDesktopSettings() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/** Mounted once at the root. Renders nothing in the browser version. */
export function DesktopSettingsHost() {
  const bridge = desktopBridge();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!bridge) return;
    const show = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, show);
    const unsubscribe = bridge.onOpenSettings(show);
    return () => {
      window.removeEventListener(OPEN_EVENT, show);
      unsubscribe();
    };
  }, [bridge]);

  if (!bridge) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {open && <SettingsForm bridge={bridge} onDone={() => setOpen(false)} />}
    </Dialog>
  );
}

function SettingsForm({ bridge, onDone }: { bridge: DesktopBridge; onDone: () => void }) {
  const ids = { key: useId(), contact: useId() };
  const [saved, setSaved] = useState<DesktopSettings>();
  const [key, setKey] = useState('');
  const [removeKey, setRemoveKey] = useState(false);
  const [contact, setContact] = useState('');
  const [outputDir, setOutputDir] = useState('');
  const [renderGl, setRenderGl] = useState('angle');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    bridge
      .getSettings()
      .then((settings) => {
        setSaved(settings);
        setContact(settings.serviceContact);
        setOutputDir(settings.outputDir);
        setRenderGl(settings.renderGl);
      })
      .catch((reason: unknown) => setError(de.settings.failed(bridgeErrorMessage(reason))));
  }, [bridge]);

  async function chooseOutputDir() {
    const folder = await bridge.chooseFolder(de.settings.outputDirPick, outputDir);
    if (folder) setOutputDir(folder);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!saved) return;
    // Only what changed: an empty key field keeps the stored key.
    const patch: DesktopSettingsPatch = {};
    if (removeKey) patch.orsApiKey = null;
    else if (key.trim()) patch.orsApiKey = key.trim();
    if (contact.trim() !== saved.serviceContact) patch.serviceContact = contact.trim();
    if (outputDir !== saved.outputDir) {
      patch.outputDir = outputDir === saved.defaultOutputDir ? null : outputDir;
    }
    if (renderGl !== saved.renderGl) patch.renderGl = renderGl;
    if (Object.keys(patch).length === 0) {
      onDone();
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      // The app restarts its server with the new settings and reloads this page.
      await bridge.updateSettings(patch);
      onDone();
    } catch (reason) {
      setError(de.settings.failed(bridgeErrorMessage(reason)));
      setBusy(false);
    }
  }

  return (
    <DialogContent className="sm:max-w-lg">
      {/* One shrinkable column (grid-cols-1, min-w-0): the long folder paths would otherwise
          widen the dialog instead of being shortened. */}
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="grid min-w-0 grid-cols-1 gap-4"
        noValidate
      >
        <DialogHeader>
          <DialogTitle>{de.settings.title}</DialogTitle>
          <DialogDescription>{de.settings.description}</DialogDescription>
        </DialogHeader>

        <div className="grid min-w-0 grid-cols-1 gap-1.5">
          <label htmlFor={ids.key} className="text-muted-foreground text-xs">
            {de.settings.orsKey}
          </label>
          <div className="flex gap-2">
            <Input
              id={ids.key}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={key}
              disabled={removeKey}
              onChange={(event) => setKey(event.target.value)}
            />
            {saved?.orsApiKeySet && !removeKey && (
              <Button type="button" variant="outline" onClick={() => setRemoveKey(true)}>
                {de.settings.orsKeyRemove}
              </Button>
            )}
          </div>
          <p className="text-muted-foreground text-xs">
            {removeKey
              ? de.settings.orsKeyRemoved
              : saved?.orsApiKeySet
                ? de.settings.orsKeySet
                : de.settings.orsKeyMissing}{' '}
            {de.settings.orsKeyHint}
          </p>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-1.5">
          <label htmlFor={ids.contact} className="text-muted-foreground text-xs">
            {de.settings.contact}
          </label>
          <Input
            id={ids.contact}
            value={contact}
            spellCheck={false}
            placeholder="https://github.com/…"
            onChange={(event) => setContact(event.target.value)}
          />
          <p className="text-muted-foreground text-xs">{de.settings.contactHint}</p>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-1.5">
          <span className="text-muted-foreground text-xs">{de.settings.outputDir}</span>
          <div className="flex items-center gap-2">
            <code
              className="bg-muted min-w-0 flex-1 truncate rounded px-2 py-1.5 text-xs"
              title={outputDir}
            >
              {outputDir}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void chooseOutputDir()}
            >
              <FolderOpen /> {de.settings.outputDirChange}
            </Button>
            {saved && outputDir !== saved.defaultOutputDir && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOutputDir(saved.defaultOutputDir)}
              >
                <RotateCcw /> {de.settings.outputDirDefault}
              </Button>
            )}
          </div>
        </div>

        {saved && (
          <SelectField
            label={de.settings.renderGl}
            value={renderGl}
            options={saved.renderGlOptions.map((value) => ({ value, label: value }))}
            hint={de.settings.renderGlHint}
            onCommit={(value) => {
              setRenderGl(value);
              return null;
            }}
          />
        )}

        <div className="grid min-w-0 grid-cols-1 gap-1.5">
          <span className="text-muted-foreground text-xs">{de.settings.dataDir}</span>
          <div className="flex items-center gap-2">
            <code
              className="bg-muted min-w-0 flex-1 truncate rounded px-2 py-1.5 text-xs"
              title={saved?.dataDir}
            >
              {saved?.dataDir}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void bridge.importProjects()}
            >
              <FolderInput /> {de.settings.importProjects}
            </Button>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onDone}>
            {de.common.cancel}
          </Button>
          <Button type="submit" disabled={busy || !saved}>
            {busy ? de.settings.saving : de.settings.save}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
