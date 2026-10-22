import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface FieldShellProps {
  label: string;
  /** ID of the control, so that clicking the label focuses it. */
  controlId: string;
  /** ID for the message, referenced by the control's aria-describedby. */
  messageId: string;
  error?: string | null | undefined;
  /** Shown below the control when there is no error, e.g. "folgt mit der Karte". */
  hint?: string | undefined;
  className?: string | undefined;
  children: ReactNode;
}

/** Label above, control, then an error or hint below: the same frame for every field. */
export function FieldShell({
  label,
  controlId,
  messageId,
  error,
  hint,
  className,
  children,
}: FieldShellProps) {
  const message = error ?? hint;
  return (
    <div className={cn('min-w-0 space-y-1', className)}>
      <label htmlFor={controlId} className="text-muted-foreground block truncate text-xs">
        {label}
      </label>
      {children}
      {message && (
        <p
          id={messageId}
          className={cn('text-xs', error ? 'text-destructive' : 'text-muted-foreground')}
        >
          {message}
        </p>
      )}
    </div>
  );
}

/** Props every control gets so that assistive technology knows its state and message. */
export function controlProps(
  id: string,
  messageId: string,
  error: string | null | undefined,
  hasHint: boolean,
) {
  return {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error || hasHint ? messageId : undefined,
  };
}

/** Shared look of text inputs and selects; matches the shadcn Input. */
export const CONTROL_CLASS =
  'border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 h-7 w-full min-w-0 rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50';
