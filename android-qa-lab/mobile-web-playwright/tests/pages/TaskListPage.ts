import { expect, type Locator, type Page } from '@playwright/test';
import { LoginPage } from './LoginPage';

export class TaskListPage {
  readonly welcome: Locator;
  readonly logoutButton: Locator;
  readonly taskInput: Locator;
  readonly addButton: Locator;
  readonly error: Locator;
  readonly summary: Locator;
  readonly emptyState: Locator;
  readonly list: Locator;
  readonly rows: Locator;
  readonly clearCompletedButton: Locator;
  readonly deleteDialog: Locator;

  constructor(private readonly page: Page) {
    this.welcome = page.getByRole('heading', { name: /^Welcome, / });
    this.logoutButton = page.getByRole('button', { name: 'Log out' });
    this.taskInput = page.getByLabel('New task');
    this.addButton = page.getByRole('button', { name: 'Add', exact: true });
    this.error = page.locator('#task-error');
    this.summary = page.locator('#summary');
    this.emptyState = page.getByText('Nothing here yet. Add your first task above.');
    this.list = page.getByRole('list', { name: 'Tasks' });
    this.rows = this.list.getByRole('listitem');
    this.clearCompletedButton = page.getByRole('button', { name: 'Clear completed' });
    this.deleteDialog = page.getByRole('dialog', { name: 'Delete task?' });
  }

  checkbox(title: string) {
    return this.list.getByRole('checkbox', { name: title, exact: true });
  }

  deleteButton(title: string) {
    return this.list.getByRole('button', { name: `Delete ${title}`, exact: true });
  }

  /** Adds tasks that are expected to be accepted. */
  async addTasks(...titles: string[]) {
    for (const title of titles) {
      const before = await this.rows.count();
      await this.taskInput.fill(title);
      await this.addButton.click();
      await expect(this.rows).toHaveCount(before + 1);
    }
    return this;
  }

  /** Submits a title expected to be rejected; returns the error shown. */
  async tryAddTask(title: string) {
    await this.taskInput.fill(title);
    await this.addButton.click();
    await expect(this.error).toBeVisible();
    return (await this.error.textContent()) ?? '';
  }

  async titles() {
    return this.list.locator('.title').allTextContents();
  }

  async toggle(title: string) {
    const box = this.checkbox(title);
    const wasChecked = await box.isChecked();
    await box.click();
    await (wasChecked ? expect(box).not.toBeChecked() : expect(box).toBeChecked());
    return this;
  }

  async openDelete(title: string) {
    await this.deleteButton(title).click();
    await expect(this.deleteDialog).toBeVisible();
    return this.deleteDialog;
  }

  async confirmDelete(title: string) {
    const dialog = await this.openDelete(title);
    await dialog.getByRole('button', { name: 'Delete' }).click();
    await expect(dialog).toBeHidden();
    return this;
  }

  async cancelDelete(title: string) {
    const dialog = await this.openDelete(title);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    return this;
  }

  async logout() {
    await this.logoutButton.click();
    const login = new LoginPage(this.page);
    await expect(login.heading).toBeVisible();
    return login;
  }
}
