export const VALID_USER = { username: 'qa_user', password: 'Passw0rd!' };
export const VIEWER_USER = { username: 'qa_viewer', password: 'Passw0rd!' };

/**
 * Every test runs with the browser clock frozen here: Monday 26 Oct 2026, 10:00 in Chicago.
 * "Overdue", "next run" and audit times are therefore always the same.
 */
export const FIXED_NOW = new Date('2026-10-26T15:00:00Z');
export const TODAY = '2026-10-26';

export const MSG = {
  USERNAME_REQUIRED: 'Username is required',
  PASSWORD_REQUIRED: 'Password is required',
  INVALID_CREDENTIALS: 'Invalid username or password',
  ACCOUNT_LOCKED: 'Account locked after 3 failed attempts',
  TASK_EMPTY: 'Task cannot be empty',
  TASK_TOO_LONG: 'Task must be 40 characters or fewer',
  TASK_DUPLICATE: 'Task already exists',
  NO_TASKS: 'No tasks yet',
  SCHEDULE_NAME_REQUIRED: 'Report name is required',
  SCHEDULE_NAME_TOO_LONG: 'Report name must be 40 characters or fewer',
  SCHEDULE_DUPLICATE: 'A schedule with this name already exists',
} as const;
