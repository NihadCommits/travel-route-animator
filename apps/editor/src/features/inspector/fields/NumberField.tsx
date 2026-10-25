import { useId } from 'react';
import { cn } from '@/lib/utils';
import { de } from '@/i18n/de';
import { CONTROL_CLASS, controlProps, FieldShell } from './FieldShell';
import { useDraft, type Commit, type Parsed } from './useDraft';

export interface NumberFieldProps {
  label: string;
  value: number;
  onCommit: Commit<number>;
  /** Shown inside the field, e.g. "s", "°", "px". */
  unit?: string | undefined;
  /** Step for the arrow keys; Shift takes ten steps. */
  step?: number | undefined;
  disabled?: boolean | undefined;
  /** Shown and stepped decimals; coordinates need more than the default 3. */
  fractionDigits?: number | undefined;
  hint?: string | undefined;
  className?: string | undefined;
}

// A trailing separator ("2,") is a normal step while typing a decimal and counts as 2.
const NUMBER = /^-?(?:\d+[.,]?\d*|[.,]\d+)$/;

/** Reads a number as people type it here: with a decimal comma or a point. */
export function parseNumber(text: string): Parsed<number> {
  const trimmed = text.trim();
  if (!NUMBER.test(trimmed)) return { error: de.fields.notANumber };
  return { value: Number(trimmed.replace(',', '.')) };
}

export function formatNumber(value: number, fractionDigits = 3): string {
  return value.toLocaleString('de-AT', {
    maximumFractionDigits: fractionDigits,
    useGrouping: false,
  });
}

export function NumberField({
  label,
  value,
  onCommit,
  unit,
  step = 1,
  disabled,
  fractionDigits = 3,
  hint,
  className,
}: NumberFieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const format = (number: number) => formatNumber(number, fractionDigits);
  const field = useDraft(value, format, parseNumber, onCommit);

  function nudge(by: number) {
    const parsed = parseNumber(field.text);
    const current = 'value' in parsed ? parsed.value : value;
    // Rounding keeps 0.1 + 0.2 from showing up as 0,30000000000000004.
    const scale = 10 ** fractionDigits;
    field.change(format(Math.round((current + by) * scale) / scale));
  }

  return (
    <FieldShell
      label={label}
      controlId={id}
      messageId={messageId}
      error={field.error}
      hint={hint}
      className={className}
    >
      <div className="relative">
        <input
          {...controlProps(id, messageId, field.error, hint !== undefined)}
          type="text"
          inputMode="decimal"
          className={cn(CONTROL_CLASS, 'tabular-nums', unit && 'pr-7')}
          value={field.text}
          disabled={disabled}
          size={1}
          onChange={(event) => field.change(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') field.reset();
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault();
              const steps = event.shiftKey ? 10 : 1;
              nudge((event.key === 'ArrowUp' ? 1 : -1) * steps * step);
            }
          }}
          onBlur={field.reset}
        />
        {unit && (
          <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs">
            {unit}
          </span>
        )}
      </div>
    </FieldShell>
  );
}
