import { useId } from 'react';
import { CONTROL_CLASS, controlProps, FieldShell } from './FieldShell';
import { useDraft, type Commit } from './useDraft';

export interface TextFieldProps {
  label: string;
  value: string;
  onCommit: Commit<string>;
  placeholder?: string | undefined;
  hint?: string | undefined;
  className?: string | undefined;
}

const keep = (text: string) => ({ value: text });

export function TextField({
  label,
  value,
  onCommit,
  placeholder,
  hint,
  className,
}: TextFieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const field = useDraft(value, String, keep, onCommit);

  return (
    <FieldShell
      label={label}
      controlId={id}
      messageId={messageId}
      error={field.error}
      hint={hint}
      className={className}
    >
      <input
        {...controlProps(id, messageId, field.error, hint !== undefined)}
        type="text"
        className={CONTROL_CLASS}
        value={field.text}
        placeholder={placeholder}
        // size=1 lets the input shrink with the panel instead of widening it.
        size={1}
        onChange={(event) => field.change(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') field.reset();
        }}
        onBlur={() => {
          // Spaces at the ends are a typing leftover, not part of the name.
          const { draft } = field;
          if (draft !== null && !field.error && draft.trim() !== draft) onCommit(draft.trim());
          field.reset();
        }}
      />
    </FieldShell>
  );
}
