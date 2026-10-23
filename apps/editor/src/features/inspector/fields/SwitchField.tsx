import { useId, useState } from 'react';
import { cn } from '@/lib/utils';
import type { Commit } from './useDraft';

export interface SwitchFieldProps {
  label: string;
  checked: boolean;
  onCommit: Commit<boolean>;
  disabled?: boolean | undefined;
  className?: string | undefined;
}

/** An on/off setting: a native checkbox with role="switch", drawn as a small toggle. */
export function SwitchField({ label, checked, onCommit, disabled, className }: SwitchFieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const [error, setError] = useState<string | null>(null);

  return (
    <div className={cn('space-y-1', className)}>
      <label htmlFor={id} className="flex items-center justify-between gap-3">
        <span className="min-w-0">{label}</span>
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? messageId : undefined}
          className="bg-input checked:bg-primary focus-visible:ring-ring/50 relative h-4 w-7 shrink-0 cursor-pointer appearance-none rounded-full transition-colors outline-none before:absolute before:top-0.5 before:left-0.5 before:size-3 before:rounded-full before:bg-white before:transition-transform checked:before:translate-x-3 focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50"
          onChange={(event) => setError(onCommit(event.target.checked))}
        />
      </label>
      {error && (
        <p id={messageId} className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
