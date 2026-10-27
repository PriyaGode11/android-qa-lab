import { test as base } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { TaskListPage } from '../pages/TaskListPage';
import { DashboardPage } from '../pages/DashboardPage';
import { ReportsPage } from '../pages/ReportsPage';
import { AuditPage } from '../pages/AuditPage';
import { MonitoringPage } from '../pages/MonitoringPage';
import { FIXED_NOW, VALID_USER, VIEWER_USER } from './data';

/**
 * Every test gets a brand-new browser context, so localStorage (session,
 * lockout counter, tasks, audit log) always starts empty. Tests never share state.
 */
type Fixtures = {
  loginPage: LoginPage;
  tasksPage: TaskListPage;
  viewerTasksPage: TaskListPage;
  dashboard: DashboardPage;
  reports: ReportsPage;
  auditPage: AuditPage;
  monitoring: MonitoringPage;
};

export const test = base.extend<Fixtures>({
  /** Freezes the browser clock so dates, "overdue" and "next run" are always the same. */
  page: async ({ page }, use) => {
    await page.clock.setFixedTime(FIXED_NOW);
    await use(page);
  },

  loginPage: async ({ page }, use) => {
    await use(await new LoginPage(page).goto());
  },

  /** Signed in as the admin demo user, on an empty task list. */
  tasksPage: async ({ loginPage }, use) => {
    await use(await loginPage.loginAs(VALID_USER.username, VALID_USER.password));
  },

  /** Signed in as the view-only demo user. */
  viewerTasksPage: async ({ loginPage }, use) => {
    await use(await loginPage.loginAs(VIEWER_USER.username, VIEWER_USER.password));
  },

  // Page objects for the other screens; they open themselves with .open().
  dashboard: async ({ page }, use) => use(new DashboardPage(page)),
  reports: async ({ page }, use) => use(new ReportsPage(page)),
  auditPage: async ({ page }, use) => use(new AuditPage(page)),
  monitoring: async ({ page }, use) => use(new MonitoringPage(page)),
});

export { expect } from '@playwright/test';
