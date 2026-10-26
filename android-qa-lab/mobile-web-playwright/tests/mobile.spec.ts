import { test, expect } from './support/fixtures';
import type { Page } from '@playwright/test';

/** Minimum touch target size, from WCAG 2.5.5 and Apple's Human Interface Guidelines. */
const MIN_TOUCH_TARGET = 44;

async function hasHorizontalScroll(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

test.describe('Mobile experience', () => {
  test('MOB-01 the page declares a mobile viewport @smoke', async ({ loginPage, page }) => {
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
      'content',
      /width=device-width/,
    );
    await expect(loginPage.heading).toBeVisible();
  });

  test('MOB-02 no sideways scrolling on any screen, even with long unbroken text', async ({ tasksPage, page }) => {
    expect(await hasHorizontalScroll(page), 'task screen').toBe(false);

    await tasksPage.addTasks('W'.repeat(40), 'Supercalifragilisticexpialidocious-ish');
    expect(await hasHorizontalScroll(page), 'with long titles').toBe(false);

    await tasksPage.openDelete('W'.repeat(40));
    expect(await hasHorizontalScroll(page), 'with the dialog open').toBe(false);
  });

  test('MOB-03 every button and checkbox row is at least 44×44 px', async ({ tasksPage, page }) => {
    await tasksPage.addTasks('Touch me');

    const targets = [
      { name: 'Add', locator: tasksPage.addButton },
      { name: 'Log out', locator: tasksPage.logoutButton },
      { name: 'Clear completed', locator: tasksPage.clearCompletedButton },
      { name: 'Delete', locator: tasksPage.deleteButton('Touch me') },
      // The whole label is tappable, not just the small checkbox square.
      { name: 'Task row', locator: page.locator('.task label').first() },
      { name: 'Task input', locator: tasksPage.taskInput },
    ];

    for (const { name, locator } of targets) {
      const box = await locator.boundingBox();
      expect(box, `${name} should be rendered`).not.toBeNull();
      expect.soft(box!.width, `${name} width`).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
      expect.soft(box!.height, `${name} height`).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    }
  });

  test('MOB-04 text inputs use at least 16px text so iPhone Safari does not zoom in', async ({ loginPage, page }) => {
    const sizes = await page
      .locator('input[type="text"], input[type="password"]')
      .evaluateAll((inputs) => inputs.map((i) => parseFloat(getComputedStyle(i).fontSize)));

    expect(sizes.length).toBeGreaterThan(0);
    for (const size of sizes) expect(size).toBeGreaterThanOrEqual(16);
    await expect(loginPage.username).toBeVisible();
  });

  test('MOB-05 tapping (touch) works for the whole task flow @smoke', async ({ tasksPage, isMobile }) => {
    test.skip(!isMobile, 'Touch input is only enabled on the phone projects');

    await tasksPage.taskInput.fill('Tapped task');
    await tasksPage.addButton.tap();
    await expect(tasksPage.checkbox('Tapped task')).toBeVisible();

    // Tap the task's text, not the checkbox: the whole row should toggle it.
    await tasksPage.list.getByText('Tapped task').tap();
    await expect(tasksPage.checkbox('Tapped task')).toBeChecked();

    await tasksPage.deleteButton('Tapped task').tap();
    await tasksPage.deleteDialog.getByRole('button', { name: 'Delete' }).tap();
    await expect(tasksPage.rows).toHaveCount(0);
  });

  test('MOB-06 rotating to landscape keeps tasks and half-typed input', async ({ tasksPage, page, isMobile }) => {
    test.skip(!isMobile, 'Rotation only applies to the phone projects');

    await tasksPage.addTasks('Rotate me');
    await tasksPage.taskInput.fill('Half typed');

    const portrait = page.viewportSize()!;
    await page.setViewportSize({ width: portrait.height, height: portrait.width });

    await expect(tasksPage.checkbox('Rotate me')).toBeVisible();
    await expect(tasksPage.taskInput).toHaveValue('Half typed');
    await expect(tasksPage.summary).toHaveText('1 task, 0 done');
    expect(await hasHorizontalScroll(page), 'landscape layout').toBe(false);

    await page.setViewportSize(portrait);
    await expect(tasksPage.checkbox('Rotate me')).toBeVisible();
  });

  test('MOB-07 form fields give the phone keyboard and password managers the right hints', async ({ loginPage }) => {
    await expect(loginPage.username).toHaveAttribute('autocomplete', 'username');
    await expect(loginPage.username).toHaveAttribute('autocapitalize', 'none');
    await expect(loginPage.username).toHaveAttribute('enterkeyhint', 'next');
    await expect(loginPage.password).toHaveAttribute('autocomplete', 'current-password');
    await expect(loginPage.password).toHaveAttribute('enterkeyhint', 'go');
  });

  test('MOB-08 the delete dialog fits on screen and is fully usable', async ({ tasksPage, page }) => {
    await tasksPage.addTasks('Check the dialog');
    const dialog = await tasksPage.openDelete('Check the dialog');

    const viewport = page.viewportSize()!;
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    await expect(dialog.getByRole('button', { name: 'Delete' })).toBeInViewport();
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeInViewport();
  });
});
