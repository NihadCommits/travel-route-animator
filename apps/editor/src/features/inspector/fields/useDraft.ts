import { useState } from 'react';

/**
 * Writes a value to the project. Returns the German message if the project would become
 * invalid (and nothing was changed), or null once the value is stored.
 */
export type Commit<T> = (value: T) => string | null;

export type Parsed<T> = { value: T } | { error: string };

/**
 * What is being typed into a text or number field (ADR 0004). The store stays the only source
 * of the value; the field keeps its own text only while it is being typed, because "2," or an
 * empty name are normal steps on the way to a valid value. Every keystroke that gives a valid
 * value is stored at once. An invalid one keeps its message until the user fixes it; leaving
 * the field or pressing Escape brings back the stored value.
 */
export function useDraft<T>(
  value: T,
  format: (value: T) => string,
  parse: (text: string) => Parsed<T>,
  commit: Commit<T>,
) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return {
    text: draft ?? format(value),
    draft,
    error,
    change: (text: string) => {
      setDraft(text);
      const parsed = parse(text);
      setError('error' in parsed ? parsed.error : commit(parsed.value));
    },
    /** Back to the stored value, e.g. on blur or Escape. */
    reset: () => {
      setDraft(null);
      setError(null);
    },
  };
}
