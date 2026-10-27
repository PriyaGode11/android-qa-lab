import { expect, type Locator, type Page } from '@playwright/test';

export class AuditPage {
  readonly root: Locator;
  readonly heading: Locator;
  readonly action: Locator;
  readonly user: Locator;
  readonly search: Locator;
  readonly list: Locator;
  readonly entries: Locator;
  readonly count: Locator;

  constructor(private readonly page: Page) {
    this.root = page.locator('#audit-view');
    this.heading = page.getByRole('heading', { name: 'Audit log' });
    this.action = this.root.getByLabel('Action');
    this.user = this.root.getByLabel('User');
    this.search = this.root.getByLabel('Search details');
    this.list = this.root.getByRole('list', { name: 'Audit entries' });
    this.entries = this.list.getByRole('listitem');
    this.count = page.locator('#audit-count');
  }

  async open() {
    await this.page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Audit' }).click();
    await expect(this.heading).toBeVisible();
    return this;
  }

  /** Action labels of the entries on screen, newest first. */
  async actions() {
    return this.list.locator('.action').allTextContents();
  }

  entriesFor(actionLabel: string) {
    return this.entries.filter({ has: this.page.locator('.action', { hasText: actionLabel }) });
  }
}
