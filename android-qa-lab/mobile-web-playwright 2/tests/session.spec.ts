import { test, expect } from './support/fixtures';
import { LoginPage } from './pages/LoginPage';
import { TaskListPage } from './pages/TaskListPage';
import { MSG, VALID_USER } from './support/data';

const { username: USER, password: PASS } = VALID_USER;

test.describe('Session and persistence', () => {
  test('SESS-01 tasks and their completion state survive a page reload @smoke', async ({ tasksPage, page }) => {
    await tasksPage.addTasks('Persisted', 'Also persisted');
    await tasksPage.toggle('Persisted');

    await page.reload();

    const tasks = new TaskListPage(page);
    expect(await tasks.titles()).toEqual(['Persisted', 'Also persisted']);
    await expect(tasks.checkbox('Persisted')).toBeChecked();
    await expect(tasks.checkbox('Also persisted')).not.toBeChecked();
    await expect(tasks.summary).toHaveText('2 tasks, 1 done');
  });

  test('SESS-02 a logged-in user goes straight to the task list in a new tab', async ({ tasksPage, context }) => {
    await expect(tasksPage.welcome).toBeVisible();

    const newTab = await context.newPage();
    await newTab.goto('/');

    await expect(new TaskListPage(newTab).welcome).toHaveText('Welcome, qa_user');
  });

  test('SESS-03 logging out ends the session, including after a reload @smoke', async ({ tasksPage, page }) => {
    await tasksPage.logout();
    await page.reload();

    await expect(new LoginPage(page).heading).toBeVisible();
    await expect(page).toHaveURL(/#\/login$/);
  });

  // Found a real bug on its first run: after logout the task list was only
  // hidden with CSS, so the previous user's tasks were still in the page.
  test('SESS-04 Back after logout never reveals the task list or leaves its data in the page', async ({ tasksPage, page }) => {
    await tasksPage.addTasks('Private task');
    await tasksPage.logout();

    await page.goBack();

    await expect(new LoginPage(page).heading).toBeVisible();
    await expect(page.getByText('Private task')).toHaveCount(0);
  });

  test('SESS-05 opening the task URL directly while logged out redirects to login', async ({ loginPage, page }) => {
    await page.goto('/#/tasks');

    await expect(loginPage.heading).toBeVisible();
    await expect(page).toHaveURL(/#\/login$/);
  });

  test('SESS-06 tasks are still there after logging out and back in', async ({ tasksPage }) => {
    await tasksPage.addTasks('Still here');
    const tasks = await (await tasksPage.logout()).loginAs(USER, PASS);

    await expect(tasks.checkbox('Still here')).toBeVisible();
  });

  test('SESS-07 account lockout survives a page reload', async ({ loginPage, page }) => {
    for (const pw of ['bad-1', 'bad-2', 'bad-3']) await loginPage.attemptLogin(USER, pw);

    await page.reload();

    expect(await new LoginPage(page).attemptLogin(USER, PASS)).toBe(MSG.ACCOUNT_LOCKED);
  });

  test('SESS-08 logging out in one tab logs out the other tab too', async ({ tasksPage, context }) => {
    const otherTab = await context.newPage();
    await otherTab.goto('/');
    await expect(new TaskListPage(otherTab).welcome).toBeVisible();

    await tasksPage.logout();

    await expect(new LoginPage(otherTab).heading).toBeVisible();
  });
});
