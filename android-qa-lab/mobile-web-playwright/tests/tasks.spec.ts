import { test, expect } from './support/fixtures';
import { MSG } from './support/data';

test.describe('Task management', () => {
  test('TASK-01 a new user sees the empty state and a disabled "Clear completed"', async ({ tasksPage }) => {
    await expect(tasksPage.emptyState).toBeVisible();
    await expect(tasksPage.summary).toHaveText(MSG.NO_TASKS);
    await expect(tasksPage.clearCompletedButton).toBeDisabled();
    await expect(tasksPage.rows).toHaveCount(0);
  });

  test('TASK-02 adding a task shows it and updates the summary @smoke', async ({ tasksPage }) => {
    await tasksPage.addTasks('Buy milk');

    await expect(tasksPage.checkbox('Buy milk')).toBeVisible();
    await expect(tasksPage.summary).toHaveText('1 task, 0 done');
    await expect(tasksPage.emptyState).toBeHidden();
    await expect(tasksPage.taskInput).toHaveValue('');
  });

  test('TASK-03 tasks are listed in the order they were added', async ({ tasksPage }) => {
    await tasksPage.addTasks('First', 'Second', 'Third');

    expect(await tasksPage.titles()).toEqual(['First', 'Second', 'Third']);
    await expect(tasksPage.summary).toHaveText('3 tasks, 0 done');
  });

  const rejected = [
    { name: 'an empty title', title: '', error: MSG.TASK_EMPTY },
    { name: 'a whitespace-only title', title: '      ', error: MSG.TASK_EMPTY },
    { name: 'a 41-character title', title: 'x'.repeat(41), error: MSG.TASK_TOO_LONG },
  ];

  for (const r of rejected) {
    test(`TASK-04 rejects ${r.name} @smoke`, async ({ tasksPage }) => {
      expect(await tasksPage.tryAddTask(r.title)).toBe(r.error);
      await expect(tasksPage.summary).toHaveText(MSG.NO_TASKS);
    });
  }

  test('TASK-05 exactly 40 characters is accepted (boundary value)', async ({ tasksPage }) => {
    const forty = 'y'.repeat(40);
    await tasksPage.addTasks(forty);

    await expect(tasksPage.checkbox(forty)).toBeVisible();
  });

  test('TASK-06 duplicates are rejected regardless of case and spacing', async ({ tasksPage }) => {
    await tasksPage.addTasks('Buy milk');

    expect(await tasksPage.tryAddTask('BUY   milk')).toBe(MSG.TASK_DUPLICATE);
    await expect(tasksPage.summary).toHaveText('1 task, 0 done');
  });

  test('TASK-07 extra whitespace is trimmed and collapsed', async ({ tasksPage }) => {
    await tasksPage.addTasks('   Pay     rent   ');

    expect(await tasksPage.titles()).toEqual(['Pay rent']);
  });

  test('TASK-08 accented characters, symbols and HTML are stored exactly', async ({ tasksPage }) => {
    const titles = ['Café & résumé #1 (draft)', '<b>not bold</b>'];
    await tasksPage.addTasks(...titles);

    // The HTML must show as text, never be rendered (protects against injection).
    expect(await tasksPage.titles()).toEqual(titles);
    await expect(tasksPage.list.locator('b')).toHaveCount(0);
  });

  test('TASK-09 the error clears after a successful add', async ({ tasksPage }) => {
    await tasksPage.tryAddTask('');
    await tasksPage.addTasks('Valid task');

    await expect(tasksPage.error).toBeHidden();
  });

  test('TASK-10 completing and un-completing a task updates the summary @smoke', async ({ tasksPage }) => {
    await tasksPage.addTasks('One', 'Two');

    await tasksPage.toggle('One');
    await expect(tasksPage.checkbox('Two')).not.toBeChecked();
    await expect(tasksPage.summary).toHaveText('2 tasks, 1 done');
    await expect(tasksPage.clearCompletedButton).toBeEnabled();

    await tasksPage.toggle('One');
    await expect(tasksPage.summary).toHaveText('2 tasks, 0 done');
    await expect(tasksPage.clearCompletedButton).toBeDisabled();
  });

  test('TASK-11 deleting asks for confirmation, then removes only that task @smoke', async ({ tasksPage }) => {
    await tasksPage.addTasks('Keep me', 'Delete me');

    const dialog = await tasksPage.openDelete('Delete me');
    await expect(dialog).toContainText('"Delete me" will be removed.');
    await dialog.getByRole('button', { name: 'Delete' }).click();

    await expect(dialog).toBeHidden();
    expect(await tasksPage.titles()).toEqual(['Keep me']);
    await expect(tasksPage.summary).toHaveText('1 task, 0 done');
  });

  test('TASK-12 cancelling the delete dialog keeps the task', async ({ tasksPage }) => {
    await tasksPage.addTasks('Important');
    await tasksPage.cancelDelete('Important');

    await expect(tasksPage.checkbox('Important')).toBeVisible();
    await expect(tasksPage.summary).toHaveText('1 task, 0 done');
  });

  test('TASK-13 deleting the last task brings back the empty state', async ({ tasksPage }) => {
    await tasksPage.addTasks('Only task');
    await tasksPage.confirmDelete('Only task');

    await expect(tasksPage.emptyState).toBeVisible();
    await expect(tasksPage.summary).toHaveText(MSG.NO_TASKS);
  });

  test('TASK-14 "Clear completed" removes only completed tasks', async ({ tasksPage }) => {
    await tasksPage.addTasks('A', 'B', 'C');
    await tasksPage.toggle('A');
    await tasksPage.toggle('C');

    await tasksPage.clearCompletedButton.click();

    expect(await tasksPage.titles()).toEqual(['B']);
    await expect(tasksPage.summary).toHaveText('1 task, 0 done');
    await expect(tasksPage.clearCompletedButton).toBeDisabled();
  });

  test('TASK-15 a long list scrolls and every task stays reachable', async ({ tasksPage, page }) => {
    const titles = Array.from({ length: 15 }, (_, i) => `Task ${i + 1}`);
    await tasksPage.addTasks(...titles);

    await expect(tasksPage.summary).toHaveText('15 tasks, 0 done');
    const last = tasksPage.checkbox('Task 15');
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
    await tasksPage.toggle('Task 15');

    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(tasksPage.checkbox('Task 1')).toBeInViewport();
  });

  test('TASK-16 pressing Enter (the keyboard "Done" key) adds the task', async ({ tasksPage }) => {
    await tasksPage.taskInput.fill('From keyboard');
    await tasksPage.taskInput.press('Enter');

    await expect(tasksPage.checkbox('From keyboard')).toBeVisible();
  });
});
