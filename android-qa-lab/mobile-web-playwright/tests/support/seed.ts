import type { Page } from '@playwright/test';
import { TODAY } from './data';

export type Task = {
  id: number;
  title: string;
  done: boolean;
  priority: 'Low' | 'Medium' | 'High';
  due: string | null;
  createdBy: string;
};

export type AuditEntry = {
  id: number;
  at: string;
  user: string;
  action: string;
  details: string;
  before?: string;
  after?: string;
};

const t = (id: number, title: string, priority: Task['priority'], due: string | null, done = false): Task =>
  ({ id, title, priority, due, done, createdBy: 'qa_user' });

/** Ten tasks covering every status, priority, due-date edge and a CSV-hostile title. Today is 2026-10-26. */
export const SEED_TASKS: Task[] = [
  t(1, 'Pay rent', 'High', '2026-10-20'),               // overdue
  t(2, 'Book flights', 'Medium', '2026-10-26'),         // due today: NOT overdue
  t(3, 'Renew passport', 'High', '2026-11-05'),
  t(4, 'Buy milk', 'Low', null),                        // no due date
  t(5, 'File taxes', 'High', '2026-10-15', true),       // late but done: NOT overdue
  t(6, 'Call plumber', 'Medium', '2026-10-25'),         // overdue by one day
  t(7, 'Team lunch', 'Low', '2026-10-30', true),
  t(8, 'Quarterly report', 'High', '2026-10-31'),
  t(9, 'Dentist appointment', 'Medium', '2026-10-26', true),
  t(10, 'Café, "quoted" & résumé', 'Low', '2026-11-01'), // commas, quotes, accents
];

/** Generates many tasks for paging and large-data tests. */
export function manyTasks(count: number): Task[] {
  return Array.from({ length: count }, (_, i) =>
    t(i + 1, `Bulk task ${String(i + 1).padStart(3, '0')}`, (['Low', 'Medium', 'High'] as const)[i % 3],
      `2026-11-${String((i % 28) + 1).padStart(2, '0')}`, i % 4 === 0));
}

/**
 * Writes data straight into the app's storage and reloads, like seeding a test database
 * through an API. Much faster and more precise than typing 100 tasks through the UI.
 */
export async function seed(page: Page, data: { tasks?: Task[]; schedules?: unknown[]; audit?: unknown[] }) {
  await page.evaluate((d) => {
    for (const [key, value] of Object.entries(d)) localStorage.setItem(`tasklab.${key}`, JSON.stringify(value));
  }, data);
  await page.reload();
}

/** Reads what the app actually stored: the source of truth tests compare the UI against. */
export async function readStore<T>(page: Page, key: 'tasks' | 'audit' | 'schedules' | 'runs'): Promise<T[]> {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(`tasklab.${k}`) || '[]'), key);
}

export const auditLog = (page: Page) => readStore<AuditEntry>(page, 'audit');

/** Counts audit entries for one action (optionally only those whose details contain some text). */
export async function auditCount(page: Page, action: string, detailsContain?: string) {
  const log = await auditLog(page);
  return log.filter((e) => e.action === action && (!detailsContain || e.details.includes(detailsContain))).length;
}

// ---- an independent "oracle" of the dashboard rules, written from the requirements ----

export type Filters = { status?: 'all' | 'open' | 'done'; priority?: 'all' | 'low' | 'medium' | 'high'; from?: string; to?: string; q?: string };

export const isOverdue = (task: Task) => !task.done && task.due !== null && task.due < TODAY;

export function expectedMatches(tasks: Task[], f: Filters): Task[] {
  return tasks.filter((x) =>
    (!f.status || f.status === 'all' || (f.status === 'done') === x.done) &&
    (!f.priority || f.priority === 'all' || x.priority.toLowerCase() === f.priority) &&
    (!f.from || (x.due !== null && x.due >= f.from)) &&
    (!f.to || (x.due !== null && x.due <= f.to)) &&
    (!f.q || x.title.toLowerCase().includes(f.q.trim().toLowerCase())));
}

export function expectedStats(tasks: Task[]) {
  return {
    total: tasks.length,
    open: tasks.filter((x) => !x.done).length,
    done: tasks.filter((x) => x.done).length,
    overdue: tasks.filter(isOverdue).length,
  };
}
