import { test, expect } from './support/fixtures';
import { LoginPage } from './pages/LoginPage';
import { TaskListPage } from './pages/TaskListPage';
import { VALID_USER, VIEWER_USER } from './support/data';
import { SEED_TASKS, seed } from './support/seed';

const SCHEDULES = [{
  id: 1, name: 'Daily tasks', frequency: 'daily', time: '09:00', weekday: 1, dayOfMonth: 1,
  timeZone: 'America/Chicago', paused: false, createdBy: 'qa_user',
}];

test.describe('Roles and permissions', () => {
  test('ROLE-01 a viewer sees tasks but cannot change them @smoke', async ({ viewerTasksPage, page }) => {
    await seed(page, { tasks: SEED_TASKS });
    const tasks = new TaskListPage(page);

    await expect(tasks.welcome).toHaveText('Welcome, qa_viewer');
    await expect(page.locator('#role-badge')).toHaveText('Viewer');
    await expect(tasks.rows).toHaveCount(SEED_TASKS.length);
    await expect(tasks.taskInput).toBeHidden();
    await expect(tasks.clearCompletedButton).toBeHidden();
    await expect(tasks.list.getByRole('button')).toHaveCount(0); // no delete buttons
    await expect(tasks.checkbox('Pay rent')).toBeDisabled();
    await expect(page.getByText('You have view-only access.', { exact: true })).toBeVisible();
    expect(viewerTasksPage).toBeTruthy();
  });

  test('ROLE-02 a viewer has no Audit link, and the audit URL sends them back to Tasks', async ({ viewerTasksPage, page }) => {
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Audit' })).toBeHidden();

    await page.goto('/#/audit');

    await expect(page).toHaveURL(/#\/tasks$/);
    await expect(page.getByRole('heading', { name: 'Audit log' })).toBeHidden();
    await expect(page.locator('#audit-list li')).toHaveCount(0); // no audit data in the page at all
    expect(viewerTasksPage).toBeTruthy();
  });

  test('ROLE-03 a viewer can see scheduled reports but not create, run, pause or delete them', async ({ viewerTasksPage, page, reports }) => {
    await seed(page, { schedules: SCHEDULES });
    await reports.open();

    await expect(reports.schedule('Daily tasks')).toBeVisible();
    await expect(reports.form).toBeHidden();
    await expect(reports.schedule('Daily tasks').getByRole('button')).toHaveCount(0);
    await expect(reports.readOnlyNote).toBeVisible();
    expect(viewerTasksPage).toBeTruthy();
  });

  test('ROLE-04 a viewer can still filter the dashboard and export it', async ({ viewerTasksPage, page, dashboard }) => {
    await seed(page, { tasks: SEED_TASKS });
    await dashboard.open();
    await dashboard.setFilters({ priority: 'high' });

    const [download] = await Promise.all([page.waitForEvent('download'), dashboard.exportButton.click()]);
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
    expect(viewerTasksPage).toBeTruthy();
  });

  test('ROLE-05 switching from viewer to admin gives back full access', async ({ viewerTasksPage, page }) => {
    const login = await viewerTasksPage.logout();
    const tasks = await login.loginAs(VALID_USER.username, VALID_USER.password);

    await expect(tasks.taskInput).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Audit' })).toBeVisible();
    await expect(page.locator('#role-badge')).toBeHidden();
  });
});

test('ROLE-06 the login page lists both demo roles', async ({ page }) => {
  const login = await new LoginPage(page).goto();
  await expect(page.getByText(`${VALID_USER.username} (admin)`)).toBeVisible();
  await expect(page.getByText(`${VIEWER_USER.username} (view only)`)).toBeVisible();
  await expect(login.heading).toBeVisible();
});
