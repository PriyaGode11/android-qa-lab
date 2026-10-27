import { test, expect } from './support/fixtures';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { VALID_USER } from './support/data';
import { SEED_TASKS, expectedMatches, expectedStats, manyTasks, seed, type Filters } from './support/seed';

const sorted = (titles: string[]) => [...titles].sort();
const titlesOf = (f: Filters) => sorted(expectedMatches(SEED_TASKS, f).map((t) => t.title));

test.describe('Dashboard with filters', () => {
  test.beforeEach(async ({ tasksPage, page, dashboard }) => {
    await expect(tasksPage.welcome).toBeVisible();
    await seed(page, { tasks: SEED_TASKS });
    await dashboard.open();
  });

  test('DASH-01 summary numbers match the stored data, not hard-coded values @smoke', async ({ dashboard }) => {
    // The expected numbers come from the data itself (via an independent "oracle"), not from the screen.
    expect(await dashboard.stats()).toEqual(expectedStats(SEED_TASKS));
    await expect(dashboard.resultsCount).toHaveText(`Showing ${SEED_TASKS.length} of ${SEED_TASKS.length} tasks`);
  });

  test('DASH-02 overdue means "open and due before today": due today and done-but-late are not overdue', async ({ dashboard }) => {
    await expect(dashboard.stat('Overdue')).toHaveText('2'); // Pay rent, Call plumber

    await dashboard.setFilters({ q: 'Book flights' }); // due today
    await expect(dashboard.stat('Overdue')).toHaveText('0');
    await dashboard.setFilters({ q: 'File taxes' }); // late, but done
    await expect(dashboard.stat('Overdue')).toHaveText('0');
  });

  const singleFilters: { name: string; filters: Filters }[] = [
    { name: 'status = open', filters: { status: 'open' } },
    { name: 'status = done', filters: { status: 'done' } },
    { name: 'priority = high', filters: { priority: 'high' } },
    { name: 'priority = low', filters: { priority: 'low' } },
    { name: 'search is case-insensitive', filters: { q: 'PASS' } },
    { name: 'due from (inclusive)', filters: { from: '2026-10-26' } },
    { name: 'due to (inclusive)', filters: { to: '2026-10-26' } },
  ];

  for (const { name, filters } of singleFilters) {
    test(`DASH-03 one filter at a time: ${name} @smoke`, async ({ dashboard }) => {
      await dashboard.setFilters(filters);

      await expect.poll(async () => sorted(await dashboard.resultTitles())).toEqual(titlesOf(filters));
      expect(await dashboard.stats()).toEqual(expectedStats(expectedMatches(SEED_TASKS, filters)));
    });
  }

  test('DASH-04 filters combine: open + high priority + due this week', async ({ dashboard }) => {
    const filters: Filters = { status: 'open', priority: 'high', from: '2026-10-26', to: '2026-11-01' };
    await dashboard.setFilters(filters);

    await expect.poll(async () => sorted(await dashboard.resultTitles())).toEqual(titlesOf(filters));
    expect(titlesOf(filters)).toEqual(['Quarterly report']); // guard: the combination really narrows things down
  });

  test('DASH-05 a date range of one day includes tasks due exactly on that day', async ({ dashboard }) => {
    await dashboard.setFilters({ from: '2026-10-26', to: '2026-10-26' });

    await expect.poll(async () => sorted(await dashboard.resultTitles()))
      .toEqual(['Book flights', 'Dentist appointment']);
  });

  test('DASH-06 a combination with no matches shows the empty state and zeros', async ({ dashboard }) => {
    await dashboard.setFilters({ status: 'done', q: 'passport' });

    await expect(dashboard.emptyState).toBeVisible();
    expect(await dashboard.stats()).toEqual({ total: 0, open: 0, done: 0, overdue: 0 });
    await expect(dashboard.exportButton).toBeDisabled();
  });

  test('DASH-07 filters are kept in the URL and survive a reload', async ({ dashboard, page }) => {
    await dashboard.setFilters({ status: 'open', priority: 'high' });
    await expect(page).toHaveURL(/#\/dashboard\?status=open&priority=high$/);

    await page.reload();

    await expect(dashboard.status).toHaveValue('open');
    await expect(dashboard.priority).toHaveValue('high');
    await expect.poll(async () => sorted(await dashboard.resultTitles()))
      .toEqual(titlesOf({ status: 'open', priority: 'high' }));
  });

  test('DASH-08 a shared dashboard link opens with the same filters in a new tab', async ({ dashboard, page, context }) => {
    await dashboard.setFilters({ priority: 'medium', q: 'a' });
    const sharedUrl = page.url();

    const colleague = await context.newPage();
    await colleague.goto(sharedUrl);
    const theirDashboard = new DashboardPage(colleague);

    await expect(theirDashboard.priority).toHaveValue('medium');
    await expect.poll(async () => sorted(await theirDashboard.resultTitles()))
      .toEqual(titlesOf({ priority: 'medium', q: 'a' }));
  });

  test('DASH-09 "Clear filters" resets every filter, the results and the URL', async ({ dashboard, page }) => {
    await dashboard.setFilters({ status: 'done', priority: 'low', from: '2026-10-01', to: '2026-10-31', q: 'lunch' });

    await dashboard.clearFiltersButton.click();

    for (const field of [dashboard.dueFrom, dashboard.dueTo, dashboard.search]) await expect(field).toHaveValue('');
    await expect(dashboard.status).toHaveValue('all');
    await expect(dashboard.priority).toHaveValue('all');
    await expect(page).toHaveURL(/#\/dashboard$/);
    await expect(dashboard.stat('Total')).toHaveText(String(SEED_TASKS.length));
  });

  test('DASH-10 HTML typed into the search box is treated as text', async ({ dashboard }) => {
    await dashboard.setFilters({ q: '<img src=x onerror=alert(1)>' });

    await expect(dashboard.emptyState).toBeVisible();
    await expect(dashboard.root.locator('img')).toHaveCount(0);
  });
});

test.describe('Dashboard with large data sets', () => {
  test('DASH-11 120 tasks are paged 50 at a time with "Show more"', async ({ tasksPage, page, dashboard }) => {
    await expect(tasksPage.welcome).toBeVisible();
    await seed(page, { tasks: manyTasks(120) });
    await dashboard.open();

    await expect(dashboard.resultsCount).toHaveText('Showing 50 of 120 tasks');
    await expect(dashboard.results.getByRole('listitem')).toHaveCount(50);

    await dashboard.showMoreButton.click();
    await expect(dashboard.resultsCount).toHaveText('Showing 100 of 120 tasks');

    await dashboard.showMoreButton.click();
    await expect(dashboard.resultsCount).toHaveText('Showing 120 of 120 tasks');
    await expect(dashboard.showMoreButton).toBeHidden();
  });

  test('DASH-12 filtering 1,000 tasks stays fast (under 2 seconds, including test overhead)', async ({ tasksPage, page, dashboard }) => {
    await expect(tasksPage.welcome).toBeVisible();
    await seed(page, { tasks: manyTasks(1000) });
    await dashboard.open();

    const started = Date.now();
    await dashboard.setFilters({ priority: 'high' });
    await expect(dashboard.stat('Total')).toHaveText('333');
    // Generous budget: this catches a real slowdown (e.g. 10x) without failing on a busy CI machine.
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

test('DASH-13 a dashboard link opened while signed out returns there after login', async ({ page }) => {
  await page.goto('/#/dashboard?status=done');
  const login = new LoginPage(page);
  await expect(login.heading).toBeVisible();

  await login.loginAs(VALID_USER.username, VALID_USER.password);

  await expect(page).toHaveURL(/#\/dashboard\?status=done$/);
  await expect(new DashboardPage(page).status).toHaveValue('done');
});

test('DASH-14 the dashboard fits a phone screen with no sideways scrolling', async ({ tasksPage, page, dashboard }) => {
  await expect(tasksPage.welcome).toBeVisible();
  await seed(page, { tasks: SEED_TASKS });
  await dashboard.open();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
  for (const control of [dashboard.status, dashboard.priority, dashboard.dueFrom, dashboard.search, dashboard.exportButton]) {
    const box = (await control.boundingBox())!;
    expect.soft(box.height, 'touch target height').toBeGreaterThanOrEqual(44);
  }
});
