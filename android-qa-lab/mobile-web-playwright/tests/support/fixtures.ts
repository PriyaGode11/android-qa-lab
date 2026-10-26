import { test as base } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { TaskListPage } from '../pages/TaskListPage';
import { VALID_USER } from './data';

/**
 * Every test gets a brand-new browser context, so localStorage (session,
 * lockout counter, tasks) always starts empty. Tests never share state.
 */
type Fixtures = {
  loginPage: LoginPage;
  tasksPage: TaskListPage;
};

export const test = base.extend<Fixtures>({
  loginPage: async ({ page }, use) => {
    await use(await new LoginPage(page).goto());
  },

  /** Already logged in as the demo user, on an empty task list. */
  tasksPage: async ({ loginPage }, use) => {
    await use(await loginPage.loginAs(VALID_USER.username, VALID_USER.password));
  },
});

export { expect } from '@playwright/test';
