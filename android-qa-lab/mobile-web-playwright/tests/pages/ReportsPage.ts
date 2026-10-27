import { expect, type Locator, type Page } from '@playwright/test';

export type ScheduleInput = {
  name: string;
  frequency?: 'daily' | 'weekly' | 'monthly';
  time?: string;
  weekday?: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
  dayOfMonth?: number;
  timeZone?: string;
};

export class ReportsPage {
  readonly root: Locator;
  readonly heading: Locator;
  readonly form: Locator;
  readonly name: Locator;
  readonly frequency: Locator;
  readonly time: Locator;
  readonly weekday: Locator;
  readonly dayOfMonth: Locator;
  readonly timeZone: Locator;
  readonly addButton: Locator;
  readonly error: Locator;
  readonly schedules: Locator;
  readonly history: Locator;
  readonly readOnlyNote: Locator;

  constructor(private readonly page: Page) {
    this.root = page.locator('#reports-view');
    this.heading = page.getByRole('heading', { name: 'Scheduled reports' });
    this.form = this.root.getByRole('form', { name: 'New schedule' });
    this.name = this.root.getByLabel('Report name');
    this.frequency = this.root.getByLabel('Frequency');
    this.time = this.root.getByLabel('Time', { exact: true });
    this.weekday = this.root.getByLabel('Day of week');
    this.dayOfMonth = this.root.getByLabel('Day of month');
    this.timeZone = this.root.getByLabel('Time zone');
    this.addButton = this.root.getByRole('button', { name: 'Add schedule' });
    this.error = page.locator('#schedule-error');
    this.schedules = this.root.getByRole('list', { name: 'Schedules' });
    this.history = this.root.getByRole('list', { name: 'Delivery history' });
    this.readOnlyNote = this.root.getByText('You have view-only access.', { exact: false });
  }

  async open() {
    await this.page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Reports' }).click();
    await expect(this.heading).toBeVisible();
    return this;
  }

  schedule(name: string) {
    return this.schedules.getByRole('listitem', { name, exact: true });
  }

  /** The next run as an exact UTC instant (ISO string), read from the <time datetime> attribute. */
  async nextRunUtc(name: string) {
    return this.schedule(name).locator('time').getAttribute('datetime');
  }

  async fillSchedule(s: ScheduleInput) {
    await this.name.fill(s.name);
    if (s.frequency) await this.frequency.selectOption(s.frequency);
    if (s.time) await this.time.fill(s.time);
    if (s.weekday) await this.weekday.selectOption({ label: s.weekday });
    if (s.dayOfMonth) await this.dayOfMonth.selectOption(String(s.dayOfMonth));
    if (s.timeZone) await this.timeZone.selectOption(s.timeZone);
  }

  /** Adds a schedule that is expected to be accepted. */
  async addSchedule(s: ScheduleInput) {
    await this.fillSchedule(s);
    await this.addButton.click();
    await expect(this.schedule(s.name)).toBeVisible();
    return this.schedule(s.name);
  }

  /** Submits a schedule that is expected to be rejected; returns the error shown. */
  async tryAddSchedule(s: ScheduleInput) {
    await this.fillSchedule(s);
    await this.addButton.click();
    await expect(this.error).toBeVisible();
    return (await this.error.textContent()) ?? '';
  }

  async scheduleButton(name: string, button: 'Run now' | 'Pause' | 'Resume' | 'Delete') {
    return this.schedule(name).getByRole('button', { name: button });
  }
}
