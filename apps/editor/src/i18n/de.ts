// All UI strings live here so that an English translation can be added later without touching components.
export const de = {
  app: {
    title: 'Routen-Animator',
  },
  common: {
    cancel: 'Abbrechen',
    create: 'Anlegen',
    save: 'Speichern',
    rename: 'Umbenennen',
    delete: 'Löschen',
    open: 'Öffnen',
    retry: 'Erneut versuchen',
    actions: 'Aktionen',
  },
  overview: {
    title: 'Projekte',
    newProject: 'Neues Projekt',
    newTitle: 'Neues Projekt anlegen',
    renameTitle: 'Projekt umbenennen',
    nameLabel: 'Name',
    namePlaceholder: 'z. B. Portugal 2026',
    nameRequired: 'Bitte einen Namen eingeben.',
    loading: 'Projekte werden geladen …',
    empty: 'Noch keine Projekte. Lege mit „Neues Projekt“ das erste an.',
    serverDown: 'Der Server antwortet nicht. Läuft „pnpm dev“?',
    lastChanged: (date: string) => `Zuletzt geändert ${date}`,
    deleteTitle: (name: string) => `„${name}“ löschen?`,
    deleteDescription:
      'Das Projekt wird in den Papierkorb (data/.trash) verschoben und kann von dort wiederhergestellt werden.',
    failed: (reason: string) => `Das hat nicht geklappt: ${reason}`,
  },
} as const;

const dateFormat = new Intl.DateTimeFormat('de-AT', { dateStyle: 'medium', timeStyle: 'short' });

export function formatDateTime(iso: string): string {
  return dateFormat.format(new Date(iso));
}
