import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { OUTPUT_DIR } from '../playwright.config';
import { answerPlaceSearch } from './places';

// The flow the tool exists for, end to end: a new project, a stage with a train from Salzburg
// to Linz, the preview playing it, and a real video coming out of the render queue.

test('a new project goes from an empty stage to a rendered video', async ({ page }) => {
  await answerPlaceSearch(page);
  await page.goto('/');

  // Project
  await page.getByRole('button', { name: 'Neues Projekt' }).click();
  const create = page.getByRole('dialog', { name: 'Neues Projekt anlegen' });
  await create.getByLabel('Name').fill('E2E Reise');
  await create.getByRole('button', { name: 'Anlegen' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'E2E Reise' })).toBeVisible();

  // Group, stage and a train
  const tree = page.getByRole('tree', { name: 'Projektbaum' });
  // A new item starts with its name selected for typing.
  await page.getByRole('button', { name: 'Gruppe', exact: true }).click();
  await tree.getByRole('textbox', { name: 'Umbenennen' }).fill('Hinreise');
  await tree.getByRole('textbox', { name: 'Umbenennen' }).press('Enter');
  // A row's "+" shows up on hover, as for a user with a mouse.
  await tree.getByText('Hinreise', { exact: true }).hover();
  await tree.getByRole('button', { name: '+ Etappe' }).click();
  await tree.getByRole('textbox', { name: 'Umbenennen' }).fill('Salzburg – Linz');
  await tree.getByRole('textbox', { name: 'Umbenennen' }).press('Enter');
  await expect(tree.getByRole('treeitem', { name: 'Salzburg – Linz' })).toBeVisible();
  await tree.getByText('Salzburg – Linz', { exact: true }).hover();
  await tree.getByRole('button', { name: '+ Fahrzeug' }).click();
  await page.getByRole('dialog', { name: 'Fahrzeug wählen' }).getByText('Zug').click();

  // Two stops from the place search
  const inspector = page.getByRole('region', { name: 'Eigenschaften' });
  const search = inspector.getByRole('combobox', { name: 'Ort oder Flughafen suchen' });
  for (const query of ['Salzburg', 'Linz']) {
    await search.fill(query);
    await page.getByRole('option', { name: new RegExp(`${query} Hauptbahnhof`) }).click();
  }
  await expect(inspector.getByRole('textbox', { name: /Name von Wegpunkt/ })).toHaveCount(2);

  // A short stage keeps the render quick.
  await tree.getByText('Salzburg – Linz', { exact: true }).click();
  const duration = inspector.getByLabel('Dauer der Fahrt');
  await duration.fill('3');
  await duration.press('Enter');
  await expect(page.getByText('Gespeichert')).toBeVisible();

  // The preview plays.
  await page.getByRole('button', { name: 'Vorschau', exact: true }).click();
  const frame = page.getByText(/^Frame \d+ \/ \d+$/);
  await expect(frame).toHaveText(/^Frame 0 \//);
  await page.getByRole('button', { name: /Abspielen/ }).click();
  await expect(frame).not.toHaveText(/^Frame 0 \//);
  await page.getByRole('button', { name: /Anhalten/ }).click();

  // Render, and wait for the queue to report the finished file.
  await page.getByRole('button', { name: 'Rendern', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Rendern' });
  await dialog.getByRole('button', { name: 'Rendern', exact: true }).click();
  // The render list opens by itself once the job is queued.
  const renders = page.getByRole('list', { name: 'Renders' });
  await expect(renders.getByText(/^Fertig in /)).toBeVisible({ timeout: 4 * 60_000 });

  const projectDirs = await readdir(OUTPUT_DIR);
  const videos = (
    await Promise.all(
      projectDirs.map(async (dir) =>
        (await readdir(join(OUTPUT_DIR, dir))).map((file) => join(OUTPUT_DIR, dir, file)),
      ),
    )
  )
    .flat()
    .filter((file) => file.endsWith('.mp4'));
  expect(videos).toHaveLength(1);
  expect((await stat(videos[0]!)).size).toBeGreaterThan(10_000);
});
