import type { Migration } from './migrations';

// File format 4 (ADR 0010): map styles can switch labels on and off (MapStyleRef.labels) and
// theme overrides know more colours. Both are optional, so a format 3 file needs no change; the
// new number only makes an older app refuse a newer file as "too new" instead of tripping over
// an unknown field.

export const v3ToV4: Migration = {
  from: 3,
  to: 4,
  migrate: (data) => ({ ...data }),
};
