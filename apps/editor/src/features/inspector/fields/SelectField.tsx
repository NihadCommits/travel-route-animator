import { useId, useState } from 'react';
import { CONTROL_CLASS, controlProps, FieldShell } from './FieldShell';
import type { Commit } from './useDraft';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** Shown but not selectable, e.g. something that arrives in a later module. */
  disabled?: boolean | undefined;
}

export interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  options: readonly SelectOption<T>[];
  onCommit: Commit<T>;
  hint?: string | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
}

/**
 * A native select: keyboard, screen readers and the dark dropdown (color-scheme: dark) work
 * without extra code, which is all a list of a few fixed options needs.
 */
export function SelectField<T extends string>({
  label,
  value,
  options,
  onCommit,
  hint,
  disabled,
  className,
}: SelectFieldProps<T>) {
  const id = useId();
  const messageId = `${id}-message`;
  // A choice cannot be "half typed", so there is no draft; only the message of a rejected one.
  const [error, setError] = useState<string | null>(null);

  return (
    <FieldShell
      label={label}
      controlId={id}
      messageId={messageId}
      error={error}
      hint={hint}
      className={className}
    >
      <select
        {...controlProps(id, messageId, error, hint !== undefined)}
        className={CONTROL_CLASS}
        value={value}
        disabled={disabled}
        onChange={(event) => setError(onCommit(event.target.value as T))}
      >
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            className="bg-popover"
          >
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}
