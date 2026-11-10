import { useId, useState } from 'react';
import { controlProps, FieldShell } from './FieldShell';
import type { Commit } from './useDraft';

export interface SliderFieldProps {
  label: string;
  value: number;
  onCommit: Commit<number>;
  min: number;
  max: number;
  step: number;
  /** The value as it is shown next to the slider, e.g. "35 %". */
  format: (value: number) => string;
  hint?: string | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
}

/**
 * A value between two ends, such as an opacity. Every step while dragging is stored at once,
 * so the preview follows the hand; the caller merges the steps into one undo step (coalesce).
 */
export function SliderField({
  label,
  value,
  onCommit,
  min,
  max,
  step,
  format,
  hint,
  disabled,
  className,
}: SliderFieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
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
      <div className="flex items-center gap-2">
        <input
          {...controlProps(id, messageId, error, hint !== undefined)}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          className="accent-primary h-7 min-w-0 flex-1 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          onChange={(event) => setError(onCommit(Number(event.target.value)))}
        />
        <output htmlFor={id} className="w-10 shrink-0 text-right text-sm tabular-nums">
          {format(value)}
        </output>
      </div>
    </FieldShell>
  );
}
