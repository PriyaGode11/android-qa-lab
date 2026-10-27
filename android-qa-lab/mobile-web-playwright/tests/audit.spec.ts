import { test, expect } from './support/fixtures';
import { FIXED_NOW, VALID_USER } from './support/data';
import { auditCount, auditLog } from './support/seed';

test.describe('Audit log', () => {
  test('AUD-01 each action creates exactly one entry, listed newest first @smoke', async ({ tasksPage, auditPage, page }) => {
    await tasksPage.addTasks('Audit me');
    await tasksPage.toggle('Audit me');
    await tasksPage.confirmDelete('Audit me');

    for (const action of ['LOGIN', 'TASK_CREATED', 'TASK_COMPLETED', 'TASK_DELETED']) {
      expect(await auditCount(page, action), action).toBe(1);
    }

    await auditPage.open();
    expect(await auditPage.actions()).toEqual(['Task deleted', 'Task completed', 'Task created', 'Login']);
    await expect(auditPage.entries.first()).toContainText('qa_user');
    await expect(auditPage.entries.first()).toContainText('"Audit me"');
  });

  test('AUD-02 failed logins and the lockout are recorded with the name that was tried', async ({ loginPage, page }) => {
    await loginPage.attemptLogin('', 'x');            // a validation error: not a sign-in attempt
    await loginPage.attemptLogin('mallory', 'guess1');
    await loginPage.attemptLogin('mallory', 'guess2');
    await loginPage.attemptLogin('mallory', 'guess3'); // third failure locks the account
    await loginPage.attemptLogin(VALID_USER.username, VALID_USER.password); // refused while locked

    // Nobody can open the audit screen while locked out, so check what was stored (the "API").
    const log = await auditLog(page);
    expect(log.map((e) => `${e.action}:${e.user}`)).toEqual([
      'LOGIN_FAILED:mallory',
      'LOGIN_FAILED:mallory',
      'LOGIN_FAILED:mallory',
      'ACCOUNT_LOCKED:mallory',
      'LOGIN_BLOCKED:qa_user',
    ]);
    expect(log[2].details).toBe('Failed attempt 3 of 3');
  });

  test('AUD-03 completing and reopening a task records the before and after values', async ({ tasksPage, auditPage }) => {
    await tasksPage.addTasks('Flip me');
    await tasksPage.toggle('Flip me');
    await tasksPage.toggle('Flip me');

    await auditPage.open();
    await expect(auditPage.entriesFor('Task completed')).toContainText('Open → Done');
    await expect(auditPage.entriesFor('Task reopened')).toContainText('Done → Open');
  });

  test('AUD-04 entries are stored in UTC and shown in the viewer\'s time zone (Chicago)', async ({ tasksPage, auditPage }) => {
    await expect(tasksPage.welcome).toBeVisible();
    await auditPage.open();

    const time = auditPage.entriesFor('Login').locator('time');
    await expect(time).toHaveAttribute('datetime', FIXED_NOW.toISOString());
    await expect(time).toHaveText(/10:00\sAM\sCDT/);
  });

  test.describe('in India', () => {
    test.use({ timezoneId: 'Asia/Kolkata' });

    test('AUD-04 the same entry shows 8:30 PM for a user in India', async ({ tasksPage, auditPage }) => {
      await expect(tasksPage.welcome).toBeVisible();
      await auditPage.open();

      const time = auditPage.entriesFor('Login').locator('time');
      await expect(time).toHaveAttribute('datetime', FIXED_NOW.toISOString());
      await expect(time).toHaveText(/8:30\sPM/);
    });
  });

  test('AUD-05 the audit log is read-only: no edit or delete controls', async ({ tasksPage, auditPage }) => {
    await tasksPage.addTasks('Something');
    await auditPage.open();

    await expect(auditPage.list.getByRole('button')).toHaveCount(0);
    await expect(auditPage.list.getByRole('textbox')).toHaveCount(0);
    await expect(auditPage.list.locator('[contenteditable="true"]')).toHaveCount(0);
  });

  test('AUD-06 filter by action, by user and by text', async ({ tasksPage, auditPage, page }) => {
    await tasksPage.addTasks('Alpha', 'Beta', 'Gamma');
    await tasksPage.toggle('Beta');
    await auditPage.open();
    const total = (await auditLog(page)).length;
    await expect(auditPage.count).toHaveText(`${total} entries`);

    await auditPage.action.selectOption({ label: 'Task created' });
    await expect(auditPage.entries).toHaveCount(3);

    await auditPage.search.fill('gamma');
    await expect(auditPage.entries).toHaveCount(1);
    await expect(auditPage.count).toHaveText('1 entry');

    await auditPage.action.selectOption('all');
    await auditPage.search.fill('');
    await auditPage.user.selectOption('qa_user');
    await expect(auditPage.entries).toHaveCount(total);
  });

  test('AUD-07 exports and schedule changes are audited with their details', async ({ tasksPage, dashboard, reports, page }) => {
    await tasksPage.addTasks('Export me');
    await dashboard.open();
    await dashboard.setFilters({ status: 'open' });
    await Promise.all([page.waitForEvent('download'), dashboard.exportButton.click()]);
    await reports.open();
    await reports.addSchedule({ name: 'Weekly ops', frequency: 'weekly', weekday: 'Friday', time: '16:00' });

    const log = await auditLog(page);
    expect(log.find((e) => e.action === 'REPORT_EXPORTED')?.details).toBe('CSV with 1 row (filters: status=open)');
    expect(log.find((e) => e.action === 'SCHEDULE_CREATED')?.details)
      .toBe('"Weekly ops": Weekly on Friday at 16:00 (America/Chicago)');
  });

  test('AUD-08 HTML in a task title is shown as text in the audit log', async ({ tasksPage, auditPage }) => {
    await tasksPage.addTasks('<b>bold?</b>');
    await auditPage.open();

    await expect(auditPage.entriesFor('Task created')).toContainText('"<b>bold?</b>"');
    await expect(auditPage.list.locator('b')).toHaveCount(0);
  });
});
