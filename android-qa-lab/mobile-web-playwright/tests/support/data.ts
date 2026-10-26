export const VALID_USER = { username: 'qa_user', password: 'Passw0rd!' };

export const MSG = {
  USERNAME_REQUIRED: 'Username is required',
  PASSWORD_REQUIRED: 'Password is required',
  INVALID_CREDENTIALS: 'Invalid username or password',
  ACCOUNT_LOCKED: 'Account locked after 3 failed attempts',
  TASK_EMPTY: 'Task cannot be empty',
  TASK_TOO_LONG: 'Task must be 40 characters or fewer',
  TASK_DUPLICATE: 'Task already exists',
  NO_TASKS: 'No tasks yet',
} as const;
