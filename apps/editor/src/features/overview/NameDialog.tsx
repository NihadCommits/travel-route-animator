import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { de } from '@/i18n/de';

interface NameDialogProps {
  open: boolean;
  title: string;
  submitLabel: string;
  initialName?: string;
  onOpenChange: (open: boolean) => void;
  /** Resolves when done; a rejection is shown inside the dialog. */
  onSubmit: (name: string) => Promise<unknown>;
}

/** Asks for a project name, used for "new project" and "rename". */
export function NameDialog({ open, onOpenChange, ...props }: NameDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Mounting the form only while open resets its state each time the dialog opens. */}
      {open && <NameForm {...props} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function NameForm({
  title,
  submitLabel,
  initialName = '',
  onSubmit,
  onDone,
}: Omit<NameDialogProps, 'open' | 'onOpenChange'> & { onDone: () => void }) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError(de.overview.nameRequired);
      return;
    }
    setBusy(true);
    try {
      await onSubmit(trimmed);
      onDone();
    } catch (reason) {
      setError(de.overview.failed(reason instanceof Error ? reason.message : String(reason)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent>
      <form onSubmit={(event) => void handleSubmit(event)} className="grid gap-4" noValidate>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-1.5">
          <label htmlFor="project-name" className="text-muted-foreground text-xs">
            {de.overview.nameLabel}
          </label>
          <Input
            id="project-name"
            autoFocus
            value={name}
            placeholder={de.overview.namePlaceholder}
            aria-invalid={error !== undefined}
            aria-describedby={error ? 'project-name-error' : undefined}
            onChange={(event) => {
              setName(event.target.value);
              setError(undefined);
            }}
          />
          {error && (
            <p id="project-name-error" role="alert" className="text-destructive text-xs">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onDone}>
            {de.common.cancel}
          </Button>
          <Button type="submit" disabled={busy}>
            {submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
