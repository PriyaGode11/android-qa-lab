import { readFile } from 'node:fs/promises';
import { test, expect } from './support/fixtures';
import type { Page } from '@playwright/test';
import { MSG } from './support/data';
import { parseCsv } from './support/csv';
import { SEED_TASKS, auditCount, expectedMatches, readStore, seed } from './support/seed';
import type { DashboardPage } from './pages/DashboardPage';
import type { ScheduleInput } from './pages/ReportsPage';

// The clock is frozen at Monday 26 Oct 2026, 15:00 UTC (10:00 in Chicago). See support/data.ts.

async function exportCsv(page: Page, dashboard: DashboardPage) {
  const [download] = await Promise.all([page.waitForEvent('download'), dashboard.exportButton.click()]);
  const raw = await readFile((await download.path())!, 'utf8');
  return { raw, rows: parseCsv(raw.replace(/^﻿/, '')), filename: download.suggestedFilename() };
}

test.describe('Report export (CSV)', () => {
  test.beforeEach(async ({ tasksPage, page, dashboard }) => {
    await expect(tasksPage.welcome).toBeVisible();
    await seed(page, { tasks: SEED_TASKS });
    await dashboard.open();
  });

  test('REP-01 the CSV contains exactly what the dashboard shows for the same filters @smoke', async ({ page, dashboard }) => {
    await dashboard.setFilters({ status: 'open' });
    await expect(dashboard.stat('Total')).toHaveText(String(expectedMatches(SEED_TASKS, { status: 'open' }).length));

    const { rows } = await exportCsv(page, dashboard);

    expect(rows[0]).toEqual(['Title', 'Status', 'Priority', 'Due date', 'Overdue', 'Created by']);
    expect(rows.slice(1).map((r) => r[0])).toEqual(await dashboard.resultTitles()); // same rows, same order
    expect(rows.slice(1).every((r) => r[1] === 'Open')).toBe(true);
    expect(await auditCount(page, 'REPORT_EXPORTED', 'filters: status=open')).toBe(1);
  });

  test('REP-02 commas, quotes and accents survive the export; the file name carries the date', async ({ page, dashboard }) => {
    const { raw, rows, filename } = await exportCsv(page, dashboard);

    expect(filename).toBe('tasklab-tasks-2026-10-26.csv');
    expect(raw.startsWith('﻿'), 'UTF-8 byte-order mark so Excel shows accents').toBe(true);
    const tricky = rows.find((r) => r[0].startsWith('Café'));
    expect(tricky).toEqual(['Café, "quoted" & résumé', 'Open', 'Low', '2026-11-01', 'No', 'qa_user']);
    expect(rows.length - 1).toBe(SEED_TASKS.length);
  });

  test('REP-03 the "Overdue" column agrees with the dashboard', async ({ page, dashboard }) => {
    const { rows } = await exportCsv(page, dashboard);

    const overdueInCsv = rows.slice(1).filter((r) => r[4] === 'Yes').map((r) => r[0]).sort();
    expect(overdueInCsv).toEqual(['Call plumber', 'Pay rent']);
    await expect(dashboard.stat('Overdue')).toHaveText(String(overdueInCsv.length));
  });
});

test.describe('Scheduled reports', () => {
  test.beforeEach(async ({ tasksPage, reports }) => {
    await expect(tasksPage.welcome).toBeVisible();
    await reports.open();
  });

  test('REP-04 creating a daily schedule lists it with its next run @smoke', async ({ reports, page }) => {
    const item = await reports.addSchedule({ name: 'Daily tasks', frequency: 'daily', time: '09:00', timeZone: 'America/Chicago' });

    await expect(item).toContainText('Daily at 09:00 (America/Chicago)');
    // 09:00 today has passed (it is 10:00), so the next run is tomorrow 09:00 CDT = 14:00 UTC.
    expect(await reports.nextRunUtc('Daily tasks')).toBe('2026-10-27T14:00:00.000Z');
    await expect(item).toContainText('(14:00 UTC)');
    expect(await auditCount(page, 'SCHEDULE_CREATED', 'Daily tasks')).toBe(1);
  });

  const invalid: { name: string; input: ScheduleInput; error: string }[] = [
    { name: 'an empty name', input: { name: '   ' }, error: MSG.SCHEDULE_NAME_REQUIRED },
    { name: 'a 41-character name', input: { name: 'r'.repeat(41) }, error: MSG.SCHEDULE_NAME_TOO_LONG },
  ];
  for (const c of invalid) {
    test(`REP-05 rejects ${c.name}`, async ({ reports }) => {
      expect(await reports.tryAddSchedule(c.input)).toBe(c.error);
      await expect(reports.schedules.getByRole('listitem')).toHaveCount(0);
    });
  }

  test('REP-06 rejects a duplicate name, ignoring case', async ({ reports }) => {
    await reports.addSchedule({ name: 'Weekly summary' });

    expect(await reports.tryAddSchedule({ name: 'WEEKLY  summary' })).toBe(MSG.SCHEDULE_DUPLICATE);
    await expect(reports.schedules.getByRole('listitem')).toHaveCount(1);
  });

  const nextRuns: { name: string; input: Omit<ScheduleInput, 'name'>; expected: string }[] = [
    { name: 'daily, later today', input: { frequency: 'daily', time: '11:00' }, expected: '2026-10-26T16:00:00.000Z' },
    { name: 'daily, already passed today', input: { frequency: 'daily', time: '09:00' }, expected: '2026-10-27T14:00:00.000Z' },
    { name: 'weekly, Wednesday', input: { frequency: 'weekly', weekday: 'Wednesday', time: '08:30' }, expected: '2026-10-28T13:30:00.000Z' },
    // Today is Monday but 09:00 has passed: next Monday, which is after the clocks go back (CST = UTC-6).
    { name: 'weekly, Monday (crosses the DST change)', input: { frequency: 'weekly', weekday: 'Monday', time: '09:00' }, expected: '2026-11-02T15:00:00.000Z' },
    { name: 'monthly, day 1 (after the DST change)', input: { frequency: 'monthly', dayOfMonth: 1, time: '07:00' }, expected: '2026-11-01T13:00:00.000Z' },
    { name: 'monthly, today late evening', input: { frequency: 'monthly', dayOfMonth: 26, time: '23:00' }, expected: '2026-10-27T04:00:00.000Z' },
  ];
  for (const c of nextRuns) {
    test(`REP-07 next run is calculated correctly: ${c.name}`, async ({ reports }) => {
      await reports.addSchedule({ name: 'Report', timeZone: 'America/Chicago', ...c.input });

      expect(await reports.nextRunUtc('Report')).toBe(c.expected);
    });
  }

  const zones: { zone: string; expected: string }[] = [
    { zone: 'America/Los_Angeles', expected: '2026-10-26T16:00:00.000Z' }, // it is 08:00 there: today
    { zone: 'America/Chicago', expected: '2026-10-27T14:00:00.000Z' },
    { zone: 'America/New_York', expected: '2026-10-27T13:00:00.000Z' },
    { zone: 'Europe/London', expected: '2026-10-27T09:00:00.000Z' },      // UK clocks went back on 25 Oct
    { zone: 'Asia/Kolkata', expected: '2026-10-27T03:30:00.000Z' },      // half-hour offset
    { zone: 'UTC', expected: '2026-10-27T09:00:00.000Z' },
  ];
  for (const { zone, expected } of zones) {
    test(`REP-08 "09:00 daily" means 09:00 in the schedule's own time zone: ${zone}`, async ({ reports }) => {
      await reports.addSchedule({ name: 'Morning report', frequency: 'daily', time: '09:00', timeZone: zone });

      expect(await reports.nextRunUtc('Morning report')).toBe(expected);
    });
  }

  test('REP-09 daylight-saving change: 09:00 New York moves from 13:00 to 14:00 UTC', async ({ reports, page }) => {
    await reports.addSchedule({ name: 'NY report', frequency: 'daily', time: '09:00', timeZone: 'America/New_York' });

    // Saturday 31 Oct, 08:00 in New York (still daylight time, UTC-4): runs today at 13:00 UTC.
    await page.clock.setFixedTime(new Date('2026-10-31T12:00:00Z'));
    await page.reload();
    expect(await reports.nextRunUtc('NY report')).toBe('2026-10-31T13:00:00.000Z');

    // Saturday 31 Oct, 10:00 in New York: next run is Sunday 1 Nov, after the clocks go back (UTC-5).
    await page.clock.setFixedTime(new Date('2026-10-31T14:00:00Z'));
    await page.reload();
    expect(await reports.nextRunUtc('NY report')).toBe('2026-11-01T14:00:00.000Z');
    await expect(reports.schedule('NY report')).toContainText('EST');
  });

  test('REP-10 pausing, resuming and deleting a schedule (each audited once)', async ({ reports, page }) => {
    await reports.addSchedule({ name: 'Ops digest' });
    const item = reports.schedule('Ops digest');

    await (await reports.scheduleButton('Ops digest', 'Pause')).click();
    await expect(item).toContainText('Paused');
    await expect(item.locator('time')).toHaveCount(0);

    await (await reports.scheduleButton('Ops digest', 'Resume')).click();
    await expect(item.locator('time')).toHaveCount(1);

    // Cancel keeps it; confirm deletes it.
    await (await reports.scheduleButton('Ops digest', 'Delete')).click();
    await page.getByRole('dialog', { name: 'Delete schedule?' }).getByRole('button', { name: 'Cancel' }).click();
    await expect(item).toBeVisible();
    await (await reports.scheduleButton('Ops digest', 'Delete')).click();
    await page.getByRole('dialog', { name: 'Delete schedule?' }).getByRole('button', { name: 'Delete' }).click();
    await expect(item).toHaveCount(0);

    for (const action of ['SCHEDULE_PAUSED', 'SCHEDULE_RESUMED', 'SCHEDULE_DELETED']) {
      expect(await auditCount(page, action, 'Ops digest'), action).toBe(1);
    }
  });

  test('REP-11 "Run now" delivers the report with every task in it @smoke', async ({ reports, page }) => {
    await seed(page, { tasks: SEED_TASKS });
    await reports.addSchedule({ name: 'Daily tasks' });

    // Instead of waiting until 09:00 tomorrow, trigger the delivery directly.
    await (await reports.scheduleButton('Daily tasks', 'Run now')).click();

    const stored = await readStore<{ id: number }>(page, 'tasks');
    await expect(reports.history.getByRole('listitem')).toHaveCount(1);
    await expect(reports.history).toContainText(`Daily tasks: Delivered`);
    await expect(reports.history).toContainText(`${stored.length} rows`);
    expect(await auditCount(page, 'REPORT_RUN', 'Daily tasks')).toBe(1);
  });

  test('REP-12 schedules and delivery history survive a reload', async ({ reports, page }) => {
    await reports.addSchedule({ name: 'Keep me', frequency: 'weekly', weekday: 'Friday', time: '17:30' });
    await (await reports.scheduleButton('Keep me', 'Run now')).click();

    await page.reload();

    await expect(reports.schedule('Keep me')).toContainText('Weekly on Friday at 17:30');
    await expect(reports.history.getByRole('listitem')).toHaveCount(1);
  });
});
