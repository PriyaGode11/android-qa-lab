import { expect, type Locator, type Page } from '@playwright/test';
import type { Filters } from '../support/seed';

export class DashboardPage {
  readonly root: Locator;
  readonly heading: Locator;
  readonly status: Locator;
  readonly priority: Locator;
  readonly dueFrom: Locator;
  readonly dueTo: Locator;
  readonly search: Locator;
  readonly clearFiltersButton: Locator;
  readonly exportButton: Locator;
  readonly results: Locator;
  readonly resultsCount: Locator;
  readonly emptyState: Locator;
  readonly showMoreButton: Locator;

  constructor(private readonly page: Page) {
    this.root = page.locator('#dashboard-view');
    this.heading = page.getByRole('heading', { name: 'Dashboard' });
    this.status = this.root.getByLabel('Status');
    this.priority = this.root.getByLabel('Priority');
    this.dueFrom = this.root.getByLabel('Due from');
    this.dueTo = this.root.getByLabel('Due to');
    this.search = this.root.getByLabel('Search');
    this.clearFiltersButton = this.root.getByRole('button', { name: 'Clear filters' });
    this.exportButton = this.root.getByRole('button', { name: 'Export CSV' });
    this.results = this.root.getByRole('list', { name: 'Matching tasks' });
    this.resultsCount = page.locator('#results-count');
    this.emptyState = this.root.getByText('No tasks match these filters.');
    this.showMoreButton = this.root.getByRole('button', { name: 'Show more' });
  }

  /** Opens the dashboard from the main navigation, like a user would. */
  async open() {
    await this.page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Dashboard' }).click();
    await expect(this.heading).toBeVisible();
    return this;
  }

  stat(name: 'Total' | 'Open' | 'Done' | 'Overdue') {
    return this.root.getByRole('group', { name }).locator('.value');
  }

  async stats() {
    const read = async (n: 'Total' | 'Open' | 'Done' | 'Overdue') => Number(await this.stat(n).textContent());
    return { total: await read('Total'), open: await read('Open'), done: await read('Done'), overdue: await read('Overdue') };
  }

  async setFilters(f: Filters) {
    if (f.status) await this.status.selectOption(f.status);
    if (f.priority) await this.priority.selectOption(f.priority);
    if (f.from !== undefined) await this.dueFrom.fill(f.from);
    if (f.to !== undefined) await this.dueTo.fill(f.to);
    if (f.q !== undefined) await this.search.fill(f.q);
    return this;
  }

  async resultTitles() {
    return this.results.locator('.name').allTextContents();
  }
}
