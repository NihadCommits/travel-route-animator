import { X } from 'lucide-react';
import { useId } from 'react';
import { de } from '@/i18n/de';
import { cn } from '@/lib/utils';
import { CONTROL_CLASS, controlProps, FieldShell } from './FieldShell';
import { useDraft, type Commit, type Parsed } from './useDraft';

export interface ColorFieldProps {
  label: string;
  /** Hex colour; undefined means "no colour" (only with allowNone). */
  value: string | undefined;
  onCommit: Commit<string | undefined>;
  /** Offers a button to remove the colour, e.g. for the optional marker of a group. */
  allowNone?: boolean | undefined;
  className?: string | undefined;
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function parseColor(text: string): Parsed<string | undefined> {
  const trimmed = text.trim();
  return HEX.test(trimmed) ? { value: trimmed.toUpperCase() } : { error: de.fields.notAColor };
}

/** The native colour picker only understands #RRGGBB, so #ABC is spelled out for it. */
function toPickerValue(hex: string | undefined): string {
  if (!hex) return '#000000';
  if (hex.length === 4) return `#${[...hex.slice(1)].map((digit) => digit + digit).join('')}`;
  return hex.toLowerCase();
}

/** A swatch that opens the system colour picker, next to the hex code for exact values. */
export function ColorField({ label, value, onCommit, allowNone, className }: ColorFieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  // With allowNone, emptying the text removes the colour.
  const parse = (text: string): Parsed<string | undefined> =>
    allowNone && text.trim() === '' ? { value: undefined } : parseColor(text);
  const field = useDraft(value, (hex) => hex ?? '', parse, onCommit);

  return (
    <FieldShell
      label={label}
      controlId={id}
      messageId={messageId}
      error={field.error}
      className={className}
    >
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          aria-label={`${label}: ${de.fields.pickColor}`}
          className={cn(
            'h-7 w-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5',
            value === undefined && 'opacity-40',
          )}
          value={toPickerValue(value)}
          // Fires continuously while dragging in the picker; the caller merges that into one undo step.
          onChange={(event) => {
            field.reset();
            onCommit(event.target.value.toUpperCase());
          }}
        />
        <input
          {...controlProps(id, messageId, field.error, false)}
          type="text"
          className={cn(CONTROL_CLASS, 'font-mono uppercase')}
          value={field.text}
          placeholder={allowNone ? de.fields.noColor : undefined}
          size={1}
          spellCheck={false}
          onChange={(event) => field.change(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') field.reset();
          }}
          onBlur={field.reset}
        />
        {allowNone && value !== undefined && (
          <button
            type="button"
            aria-label={de.fields.removeColor}
            title={de.fields.removeColor}
            className="text-muted-foreground hover:text-foreground shrink-0"
            onClick={() => {
              field.reset();
              onCommit(undefined);
            }}
          >
            <X className="size-4" />
          </button>
        )}
      </div>
    </FieldShell>
  );
}
