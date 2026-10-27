import { expect, type Locator, type Page } from '@playwright/test';

type Tile = 'Traces' | 'Errors' | 'Warnings' | 'Average duration' | '95th percentile duration';

export class MonitoringPage {
  readonly root: Locator;
  readonly heading: Locator;
  readonly level: Locator;
  readonly search: Locator;
  readonly status: Locator;
  readonly operation: Locator;
  readonly logList: Locator;
  readonly logs: Locator;
  readonly traceList: Locator;
  readonly traces: Locator;
  readonly triggerErrorButton: Locator;

  constructor(private readonly page: Page) {
    this.root = page.locator('#monitoring-view');
    this.heading = page.getByRole('heading', { name: 'Monitoring' });
    this.level = this.root.getByLabel('Level');
    this.search = this.root.getByLabel('Search logs');
    this.status = this.root.getByLabel('Trace status');
    this.operation = this.root.getByLabel('Operation');
    this.logList = this.root.getByRole('list', { name: 'Log entries' });
    this.logs = this.logList.getByRole('listitem');
    this.traceList = this.root.getByRole('list', { name: 'Traces' });
    this.traces = this.traceList.locator(':scope > li');
    this.triggerErrorButton = this.root.getByRole('button', { name: 'Trigger a test error' });
  }

  async open() {
    await this.page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Monitoring' }).click();
    await expect(this.heading).toBeVisible();
    return this;
  }

  tile(name: Tile) {
    return this.root.getByRole('group', { name, exact: true }).locator('.value');
  }

  /** The log entries whose message contains the text. */
  logsWith(message: string) {
    return this.logs.filter({ has: this.page.locator('.log-message', { hasText: message }) });
  }

  /** The expanded step-by-step view of one trace. */
  traceDetail(traceId: string) {
    return this.root.getByRole('region', { name: `Trace ${traceId}` });
  }

  async stepNames(traceId: string) {
    return this.traceDetail(traceId).locator('.span-name').allTextContents();
  }
}
