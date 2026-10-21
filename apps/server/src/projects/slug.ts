// Windows refuses folders with these names, whatever the extension or case.
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/;

const MAX_LENGTH = 60;

/** Folder name for a project: "Portugal 2026" → "portugal-2026", "Wien – Süd" → "wien-sud". */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // accents split off by NFKD
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, MAX_LENGTH)
    .replace(/^-+|-+$/g, '');

  if (slug === '') return 'project';
  return WINDOWS_RESERVED.test(slug) ? `${slug}-project` : slug;
}

/** Appends -2, -3 … until the slug is not taken yet. */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
