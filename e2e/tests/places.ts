import type { Page } from '@playwright/test';

// Place search answers for the test, given in the browser. The test never asks Photon (fair
// use) and always gets the same places, so the route and the video are the same every run.

interface Place {
  id: string;
  name: string;
  lngLat: [number, number];
  kind: 'station' | 'locality';
  source: 'search';
  city?: string;
  countryCode?: string;
}

const PLACES: Place[] = [
  {
    id: 'e2e:salzburg-hbf',
    name: 'Salzburg Hauptbahnhof',
    lngLat: [13.0458, 47.8131],
    kind: 'station',
    source: 'search',
    city: 'Salzburg',
    countryCode: 'AT',
  },
  {
    id: 'e2e:linz-hbf',
    name: 'Linz Hauptbahnhof',
    lngLat: [14.2913, 48.2902],
    kind: 'station',
    source: 'search',
    city: 'Linz',
    countryCode: 'AT',
  },
];

export async function answerPlaceSearch(page: Page): Promise<void> {
  await page.route('**/api/geocode?**', async (route) => {
    const query = new URL(route.request().url()).searchParams.get('q')?.toLowerCase() ?? '';
    const places = PLACES.filter((place) => place.name.toLowerCase().includes(query));
    await route.fulfill({ json: { places } });
  });
  // No airport list in the test's data folder; nothing to suggest there.
  await page.route('**/api/airports?**', (route) => route.fulfill({ json: { places: [] } }));
  await page.route('**/api/reverse?**', (route) => route.fulfill({ json: { place: null } }));
}
