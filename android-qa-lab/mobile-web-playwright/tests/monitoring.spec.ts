import { test, expect } from './support/fixtures';
import { LoginPage } from './pages/LoginPage';
import { VALID_USER } from './support/data';
import { appLogs, appTraces, seed, type LogEntry, type Trace } from './support/seed';

const last = <T>(list: T[], pick: (x: T) => boolean) => [...list].reverse().find(pick)!;

test.describe('Monitoring: logs and traces', () => {
  test('MON-01 signing in records an "auth.login" trace with its steps and a linked INFO log @smoke', async ({ tasksPage, page, monitoring }) => {
    await expect(tasksPage.welcome).toBeVisible();

    const trace = last(await appTraces(page), (t) => t.name === 'auth.login');
    expect(trace.status).toBe('ok');
    expect(trace.user).toBe('qa_user');
    expect(trace.spans.map((s) => s.name)).toEqual(['check lockout', 'validate input', 'verify credentials', 'start session']);
    const log = last(await appLogs(page), (l) => l.message === 'Signed in');
    expect(log.level).toBe('INFO');
    expect(log.traceId).toBe(trace.traceId);

    // In the UI: follow the log line to its trace and see the same steps.
    await monitoring.open();
    await monitoring.logsWith('Signed in').getByRole('button', { name: `Open trace ${trace.traceId}` }).click();
    await expect(monitoring.traceDetail(trace.traceId)).toBeVisible();
    expect(await monitoring.stepNames(trace.traceId)).toEqual(trace.spans.map((s) => s.name));
  });

  test('MON-02 failed sign-ins are WARN logs with error traces; the lockout step is marked', async ({ loginPage, page }) => {
    for (const pw of ['bad-1', 'bad-2', 'bad-3']) await loginPage.attemptLogin(VALID_USER.username, pw);

    const logs = await appLogs(page);
    expect(logs.filter((l) => l.message === 'Sign-in failed: invalid username or password')).toHaveLength(3);
    expect(logs.filter((l) => l.message === 'Account locked after 3 failed attempts')).toHaveLength(1);
    expect(logs.filter((l) => l.level === 'ERROR'), 'a failed sign-in is not an app error').toHaveLength(0);

    const lockTrace = last(await appTraces(page), (t) => t.name === 'auth.login');
    expect(lockTrace.status).toBe('error');
    expect(lockTrace.spans.find((s) => s.name === 'lock account')?.status).toBe('error');
    expect(lockTrace.spans.find((s) => s.name === 'verify credentials')?.status).toBe('error');
  });

  test('MON-03 rejected input is logged as a warning, not an error', async ({ tasksPage, page }) => {
    await tasksPage.tryAddTask('   ');

    const log = last(await appLogs(page), (l) => l.message.startsWith('Task rejected'));
    expect(log.level).toBe('WARN');
    expect(log.message).toBe('Task rejected: Task cannot be empty');
    const trace = (await appTraces(page)).find((t) => t.traceId === log.traceId)!;
    expect(trace.name).toBe('task.create');
    expect(trace.status).toBe('warn');
    expect(trace.spans.map((s) => `${s.name}:${s.status}`)).toEqual(['validate:warn']);
  });

  test('MON-04 an uncaught JavaScript error is captured as ERROR with a stack trace @smoke', async ({ tasksPage, monitoring }) => {
    await expect(tasksPage.welcome).toBeVisible();
    await monitoring.open();
    await expect(monitoring.tile('Errors')).toHaveText('0');

    await monitoring.triggerErrorButton.click();

    await expect(monitoring.tile('Errors')).toHaveText('1');
    const entry = monitoring.logsWith('Simulated failure triggered from the Monitoring page');
    await expect(entry).toHaveAttribute('data-level', 'ERROR');
    // Same shape in every browser: "Error: <message>" first, then where it happened.
    await expect(entry.locator('.log-stack')).toContainText('Error: Simulated failure triggered from the Monitoring page');
    await expect(entry.locator('.log-stack')).toContainText('app.js');
    await monitoring.status.selectOption('error');
    await expect(monitoring.traceList).toContainText('app.error');
  });

  test('MON-05 every step fits inside its trace and steps are in time order', async ({ tasksPage, page }) => {
    await tasksPage.addTasks('One', 'Two');
    await tasksPage.toggle('One');
    await tasksPage.confirmDelete('Two');

    const traces = await appTraces(page);
    expect(traces.length).toBeGreaterThan(4);
    for (const t of traces) {
      let previousStart = 0;
      for (const s of t.spans) {
        expect(s.start, `${t.name} › ${s.name} start`).toBeGreaterThanOrEqual(previousStart);
        expect(s.duration, `${t.name} › ${s.name} duration`).toBeGreaterThanOrEqual(0);
        expect(s.start + s.duration, `${t.name} › ${s.name} ends inside the trace`).toBeLessThanOrEqual(t.duration + 0.05);
        previousStart = s.start;
      }
    }
  });

  test('MON-06 every log line that names a trace points to a trace that exists', async ({ tasksPage, page, reports }) => {
    await tasksPage.addTasks('Linked');
    await tasksPage.tryAddTask('Linked');
    await reports.open();
    await reports.addSchedule({ name: 'Morning' });

    const traceIds = new Set((await appTraces(page)).map((t) => t.traceId));
    const linked = (await appLogs(page)).filter((l) => l.traceId);
    expect(linked.length).toBeGreaterThan(3);
    for (const l of linked) expect(traceIds.has(l.traceId!), `log "${l.message}"`).toBe(true);
  });

  test('MON-07 the summary tiles match the stored logs and traces', async ({ tasksPage, page, monitoring }) => {
    await tasksPage.addTasks('A', 'B');
    await tasksPage.tryAddTask('a'); // duplicate: one warning
    await monitoring.open();

    const logs = await appLogs(page);
    const traces = await appTraces(page);
    await expect(monitoring.tile('Traces')).toHaveText(String(traces.length));
    await expect(monitoring.tile('Errors')).toHaveText(String(logs.filter((l) => l.level === 'ERROR').length));
    await expect(monitoring.tile('Warnings')).toHaveText(String(logs.filter((l) => l.level === 'WARN').length));

    const durations = traces.map((t) => t.duration).sort((a, b) => a - b);
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const p95 = durations[Math.ceil(0.95 * durations.length) - 1];
    expect(Number(await monitoring.tile('Average duration').textContent())).toBeCloseTo(avg, 1);
    expect(Number(await monitoring.tile('95th percentile duration').textContent())).toBeCloseTo(p95, 1);
  });

  test('MON-08 logs filter by level and text; traces filter by status and operation', async ({ tasksPage, page, monitoring }) => {
    await tasksPage.addTasks('Filter me');
    await tasksPage.tryAddTask('');
    await monitoring.open();

    await monitoring.level.selectOption('WARN');
    await expect(monitoring.logs).toHaveCount((await appLogs(page)).filter((l) => l.level === 'WARN').length);
    for (const level of await monitoring.logs.evaluateAll((els) => els.map((e) => e.getAttribute('data-level')))) {
      expect(level).toBe('WARN');
    }

    await monitoring.level.selectOption('all');
    await monitoring.search.fill('task created');
    await expect(monitoring.logs).toHaveCount(1);

    await monitoring.operation.selectOption('task.create');
    await expect(monitoring.traces).toHaveCount(2);
    await monitoring.status.selectOption('warn');
    await expect(monitoring.traces).toHaveCount(1);
  });

  test('MON-09 passwords never appear in logs or traces @smoke', async ({ page }) => {
    const login = await new LoginPage(page).goto();
    await login.attemptLogin(VALID_USER.username, 'S3cret-Wrong!');
    await login.attemptLogin('someone_else', 'An0ther-Secret');
    await login.loginAs(VALID_USER.username, VALID_USER.password);

    const everything = JSON.stringify([await appLogs(page), await appTraces(page)]);
    for (const secret of ['S3cret-Wrong!', 'An0ther-Secret', VALID_USER.password]) {
      expect(everything, `telemetry must not contain "${secret}"`).not.toContain(secret);
    }
  });

  test('MON-10 only the newest 500 logs and 200 traces are kept', async ({ tasksPage, page }) => {
    await expect(tasksPage.welcome).toBeVisible();
    const oldLogs: LogEntry[] = Array.from({ length: 600 }, (_, i) => ({
      id: i + 1, at: '2026-10-01T00:00:00.000Z', level: 'INFO', message: `Old log ${i + 1}`, user: 'qa_user', traceId: null, context: {},
    }));
    const oldTraces: Trace[] = Array.from({ length: 250 }, (_, i) => ({
      traceId: `old${String(i).padStart(13, '0')}`, name: 'old.op', at: '2026-10-01T00:00:00.000Z', user: 'qa_user',
      status: 'ok', duration: 1, attrs: {}, spans: [],
    }));

    await seed(page, { logs: oldLogs, traces: oldTraces }); // the reload itself writes one more log and trace

    const logs = await appLogs(page);
    const traces = await appTraces(page);
    expect(logs).toHaveLength(500);
    expect(logs.at(-1)!.message).toBe('App loaded');
    expect(logs[0].message).toBe('Old log 102'); // the 101 oldest were dropped
    expect(traces).toHaveLength(200);
    expect(traces.at(-1)!.name).toBe('app.load');
  });

  test('MON-11 a viewer cannot open Monitoring and no telemetry reaches their page', async ({ viewerTasksPage, page }) => {
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Monitoring' })).toBeHidden();

    await page.goto('/#/monitoring');

    await expect(page).toHaveURL(/#\/tasks$/);
    await expect(page.locator('#log-list li, #trace-list li')).toHaveCount(0);
    expect(viewerTasksPage).toBeTruthy();
  });

  test('MON-12 Monitoring fits a phone screen, even with a trace opened', async ({ tasksPage, page, monitoring }) => {
    await tasksPage.addTasks('A rather long task title for wrapping');
    await monitoring.open();
    const trace = last(await appTraces(page), (t) => t.name === 'task.create');
    await monitoring.logsWith('Task created').getByRole('button', { name: `Open trace ${trace.traceId}` }).click();
    await expect(monitoring.traceDetail(trace.traceId)).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });
});
