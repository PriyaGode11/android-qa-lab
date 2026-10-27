import { expect, type Locator, type Page } from '@playwright/test';
import { TaskListPage } from './TaskListPage';

export class LoginPage {
  readonly heading: Locator;
  readonly username: Locator;
  readonly password: Locator;
  readonly loginButton: Locator;
  readonly error: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Sign in to TaskLab' });
    this.username = page.getByLabel('Username');
    this.password = page.getByLabel('Password');
    this.loginButton = page.getByRole('button', { name: 'Log in' });
    this.error = page.locator('#login-error');
  }

  async goto() {
    await this.page.goto('/');
    await expect(this.heading).toBeVisible();
    return this;
  }

  /** Fills the form and submits it with the Log in button. */
  async submit(username: string, password: string) {
    await this.username.fill(username);
    await this.password.fill(password);
    await this.loginButton.click();
  }

  /** Logs in expecting success. */
  async loginAs(username: string, password: string) {
    await this.submit(username, password);
    const tasks = new TaskListPage(this.page);
    await expect(tasks.welcome).toBeVisible();
    return tasks;
  }

  /** Logs in expecting an error; returns the message shown. */
  async attemptLogin(username: string, password: string) {
    await this.submit(username, password);
    await expect(this.error).toBeVisible();
    return (await this.error.textContent()) ?? '';
  }
}
