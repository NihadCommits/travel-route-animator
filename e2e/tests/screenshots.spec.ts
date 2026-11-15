import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { answerPlaceSearch } from './places';

// Not a test: `pnpm screenshots` takes the editor pictures in the README from the example
// trip, so they can be made again whenever the editor changes.

const MEDIA = resolve(import.meta.dirname, '../../.github/media');

/**
 * Gives the map time to load its tiles and draw them. A fixed pause: the map keeps the
 * network busy while it streams tiles, so "network idle" can take very long.
 */
async function settle(page: Page) {
  await page.waitForTimeout(5000);
}

test('editor pictures for the README', async ({ page }) => {
  await answerPlaceSearch(page);
  await page.goto('/#/projekt/p_portugal26');
  await expect(page.getByRole('heading', { level: 1, name: 'Portugal 2026' })).toBeVisible();
  const tree = page.getByRole('tree', { name: 'Projektbaum' });

  // Editing: a stage with its route on the map, its settings and its timeline.
  await tree.getByText('Lissabon – Algarve', { exact: true }).click();
  // The first start of the map (its worker) can take a while in the dev server.
  await expect(page.getByText('Karte wird geladen …')).toHaveCount(0, { timeout: 60_000 });
  await settle(page);
  await page.screenshot({ path: resolve(MEDIA, 'editor.png') });

  // The preview of the flight to Porto, halfway, with the 3D plane over the globe.
  await tree.getByText('Wien – Porto', { exact: true }).click();
  await page.getByRole('button', { name: 'Vorschau', exact: true }).click();
  await expect(page.getByText('Vorschau wird geladen …')).toHaveCount(0, { timeout: 60_000 });
  // A click on the ruler's "5 s" jumps there, halfway through the flight.
  await page.getByRole('region', { name: 'Timeline' }).getByText('5 s', { exact: true }).click();
  await settle(page);
  await page.screenshot({ path: resolve(MEDIA, 'preview.png') });
});
