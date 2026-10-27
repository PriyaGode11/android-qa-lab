/*
 * TaskLab (mobile web).
 * - Login with a 3-strike lockout and two roles (admin, viewer)
 * - Tasks with priority and due date
 * - Dashboard with filters kept in the URL, paging and CSV export
 * - Scheduled reports with time zones (daylight saving aware) and delivery history
 * - Audit log of every important action, read-only, with filters
 * - Monitoring: structured logs (INFO/WARN/ERROR) and traces with timed steps (spans)
 * Everything is stored in localStorage.
 */
(function () {
  'use strict';

  // ---- constants --------------------------------------------------------------

  const USERS = {
    qa_user: { password: 'Passw0rd!', role: 'admin' },
    qa_viewer: { password: 'Passw0rd!', role: 'viewer' },
  };
  const MAX_ATTEMPTS = 3;
  const MAX_TITLE_LENGTH = 40;
  const PAGE_SIZE = 50;
  const PRIORITIES = ['Low', 'Medium', 'High'];

  const MSG = {
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
    SCHEDULE_TIME_REQUIRED: 'Time is required',
  };

  const AUDIT_LABELS = {
    LOGIN: 'Login',
    LOGIN_FAILED: 'Login failed',
    ACCOUNT_LOCKED: 'Account locked',
    LOGIN_BLOCKED: 'Login blocked',
    LOGOUT: 'Logout',
    TASK_CREATED: 'Task created',
    TASK_COMPLETED: 'Task completed',
    TASK_REOPENED: 'Task reopened',
    TASK_DELETED: 'Task deleted',
    TASKS_CLEARED: 'Completed tasks cleared',
    REPORT_EXPORTED: 'Report exported',
    SCHEDULE_CREATED: 'Schedule created',
    SCHEDULE_PAUSED: 'Schedule paused',
    SCHEDULE_RESUMED: 'Schedule resumed',
    SCHEDULE_DELETED: 'Schedule deleted',
    REPORT_RUN: 'Report delivered',
  };

  // ---- storage ------------------------------------------------------------------

  const KEYS = {
    user: 'tasklab.user',
    attempts: 'tasklab.failedAttempts',
    tasks: 'tasklab.tasks',
    audit: 'tasklab.audit',
    schedules: 'tasklab.schedules',
    runs: 'tasklab.runs',
    logs: 'tasklab.logs',
    traces: 'tasklab.traces',
  };

  const store = {
    get(key) {
      try { return localStorage.getItem(key); } catch (e) { return null; }
    },
    set(key, value) {
      try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      } catch (e) { /* storage unavailable: keep working for this page view */ }
    },
    list(key) {
      try {
        const parsed = JSON.parse(this.get(key) || '[]');
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        return [];
      }
    },
    saveList(key, list) { this.set(key, JSON.stringify(list)); },
  };

  let currentUser = null;
  let failedAttempts = 0;
  let tasks = [];
  let audit = [];
  let schedules = [];
  let runs = [];
  let logs = [];
  let traces = [];

  function loadAll() {
    const user = store.get(KEYS.user);
    currentUser = user && USERS[user] ? user : null;
    failedAttempts = Number(store.get(KEYS.attempts)) || 0;
    tasks = store.list(KEYS.tasks).map(normalizeTask);
    audit = store.list(KEYS.audit);
    schedules = store.list(KEYS.schedules);
    runs = store.list(KEYS.runs);
    logs = store.list(KEYS.logs);
    traces = store.list(KEYS.traces);
  }

  function normalizeTask(t) {
    return {
      id: Number(t.id),
      title: String(t.title || ''),
      done: !!t.done,
      priority: PRIORITIES.includes(t.priority) ? t.priority : 'Medium',
      due: /^\d{4}-\d{2}-\d{2}$/.test(t.due || '') ? t.due : null,
      createdBy: t.createdBy || 'qa_user',
    };
  }

  const saveTasks = () => store.saveList(KEYS.tasks, tasks);
  const role = () => (currentUser ? USERS[currentUser].role : null);
  const isAdmin = () => role() === 'admin';
  const nextId = (list) => list.reduce((max, x) => Math.max(max, Number(x.id) || 0), 0) + 1;

  function setUser(user) { currentUser = user; store.set(KEYS.user, user); }
  function setAttempts(n) { failedAttempts = n; store.set(KEYS.attempts, String(n)); }

  // ---- audit --------------------------------------------------------------------

  function record(action, details, change) {
    const entry = {
      id: nextId(audit),
      at: new Date().toISOString(),
      user: currentUser || '(signed out)',
      action,
      details: details || '',
    };
    if (change) {
      entry.before = change.before;
      entry.after = change.after;
    }
    audit.push(entry);
    store.saveList(KEYS.audit, audit);
    return entry;
  }

  function recordAs(user, action, details) {
    const saved = currentUser;
    currentUser = user;
    record(action, details);
    currentUser = saved;
  }

  // ---- telemetry: logs and traces ---------------------------------------------------
  // A trace is one user operation (e.g. "auth.login"); its spans are the timed steps
  // inside it. Log lines carry the trace id, so a log can be followed to its trace.
  // Passwords and other secrets are never written to either.

  const MAX_LOGS = 500;
  const MAX_TRACES = 200;
  const STATUS_RANK = { ok: 0, warn: 1, error: 2 };
  const clock = () => (window.performance && performance.now ? performance.now() : Date.now());
  const round = (ms) => Math.round(Math.max(0, ms) * 100) / 100;

  function newTraceId() {
    const bytes = new Uint8Array(8);
    try { crypto.getRandomValues(bytes); } catch (e) { for (let i = 0; i < 8; i++) bytes[i] = Math.floor(Math.random() * 256); }
    return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function writeLog(level, message, context, traceId) {
    logs.push({
      id: nextId(logs),
      at: new Date().toISOString(),
      level,
      message,
      user: currentUser || '(signed out)',
      traceId: traceId || null,
      context: context || {},
    });
    if (logs.length > MAX_LOGS) logs = logs.slice(-MAX_LOGS);
    store.saveList(KEYS.logs, logs);
  }

  function startTrace(name, attrs) {
    const t0 = clock();
    const trace = {
      traceId: newTraceId(),
      name,
      at: new Date().toISOString(),
      user: currentUser || '(signed out)',
      status: 'ok',
      duration: 0,
      attrs: { ...(attrs || {}) },
      spans: [],
    };
    let ended = false;
    return {
      id: trace.traceId,
      set(key, value) { trace.attrs[key] = value; },
      as(user) { trace.user = user; },
      /** Times one step. The step can mark itself sp.status = 'warn' | 'error' and add sp.attrs. */
      span(spanName, fn) {
        const s0 = clock();
        const sp = { name: spanName, start: round(s0 - t0), duration: 0, status: 'ok', attrs: {} };
        trace.spans.push(sp);
        try {
          return fn ? fn(sp) : undefined;
        } catch (e) {
          sp.status = 'error';
          sp.attrs.error = String((e && e.message) || e);
          throw e;
        } finally {
          sp.duration = round(clock() - s0);
        }
      },
      log(level, message, context) { writeLog(level, message, context, trace.traceId); },
      end(status) {
        if (ended) return trace;
        ended = true;
        const worst = trace.spans.reduce((w, s) => (STATUS_RANK[s.status] > STATUS_RANK[w] ? s.status : w), 'ok');
        trace.status = status || worst;
        trace.duration = round(clock() - t0);
        traces.push(trace);
        if (traces.length > MAX_TRACES) traces = traces.slice(-MAX_TRACES);
        store.saveList(KEYS.traces, traces);
        if (views && views.monitoring && !views.monitoring.hidden) renderMonitoring();
        return trace;
      },
    };
  }

  /** Uncaught errors anywhere in the page become an ERROR log and an error trace. */
  function captureError(message, error, extra) {
    const tr = startTrace('app.error');
    tr.span('uncaught exception', (sp) => { sp.status = 'error'; sp.attrs.message = message; });
    // Chrome's stack starts with "Error: message"; Safari's starts straight with "@file:line".
    // Always lead with the name and message so logs read the same in every browser.
    let stack = error && error.stack ? String(error.stack).split('\n').slice(0, 5).join('\n') : '';
    const headline = error && error.name ? `${error.name}: ${error.message}` : '';
    if (headline && !stack.startsWith(headline)) stack = `${headline}\n${stack}`;
    tr.log('ERROR', message || 'Unknown error', { ...(extra || {}), stack });
    tr.end('error');
  }

  window.addEventListener('error', (e) =>
    captureError(e.message, e.error, { source: String(e.filename || '').split('/').pop(), line: e.lineno, column: e.colno }));
  window.addEventListener('unhandledrejection', (e) =>
    captureError(`Unhandled promise rejection: ${(e.reason && e.reason.message) || e.reason}`, e.reason));

  // ---- dates and time zones -----------------------------------------------------

  const pad = (n) => String(n).padStart(2, '0');

  /** Today's date (YYYY-MM-DD) in the browser's time zone. */
  function todayLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  /** Wall-clock parts of an instant in a given IANA time zone. */
  function zonedParts(ms, timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(ms));
    const get = (t) => Number(parts.find((p) => p.type === t).value);
    return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), mi: get('minute') };
  }

  /** How far a time zone is ahead of UTC at a given instant, in ms (handles DST). */
  function zoneOffset(ms, timeZone) {
    const p = zonedParts(ms, timeZone);
    const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
    return asUtc - Math.floor(ms / 60000) * 60000;
  }

  /** The UTC instant of a wall-clock time in a time zone. */
  function zonedToUtc(y, m, d, h, mi, timeZone) {
    const guess = Date.UTC(y, m - 1, d, h, mi);
    const first = guess - zoneOffset(guess, timeZone);
    const second = guess - zoneOffset(first, timeZone);
    return second;
  }

  /** Next time a schedule should run, strictly after `now` (ms), or null. */
  function nextRun(schedule, now) {
    const [h, mi] = schedule.time.split(':').map(Number);
    const today = zonedParts(now, schedule.timeZone);
    for (let k = 0; k <= 62; k++) {
      const day = new Date(Date.UTC(today.y, today.m - 1, today.d + k));
      const y = day.getUTCFullYear();
      const m = day.getUTCMonth() + 1;
      const d = day.getUTCDate();
      if (schedule.frequency === 'weekly' && day.getUTCDay() !== Number(schedule.weekday)) continue;
      if (schedule.frequency === 'monthly' && d !== Number(schedule.dayOfMonth)) continue;
      const at = zonedToUtc(y, m, d, h, mi, schedule.timeZone);
      if (at > now) return at;
    }
    return null;
  }

  function formatInZone(ms, timeZone) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    }).format(new Date(ms));
  }

  function formatLocal(iso) {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    }).format(new Date(iso));
  }

  function formatDue(due) {
    if (!due) return 'No due date';
    const [y, m, d] = due.split('-').map(Number);
    return 'Due ' + new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    }).format(new Date(Date.UTC(y, m - 1, d)));
  }

  const isOverdue = (t) => !t.done && t.due !== null && t.due < todayLocal();

  // ---- rules: login and tasks ---------------------------------------------------

  function login(rawUser, password) {
    const user = rawUser.trim();
    const shown = user || '(blank)';
    const tr = startTrace('auth.login', { 'user.attempted': shown });

    const locked = tr.span('check lockout', (sp) => {
      sp.attrs.failedAttempts = failedAttempts;
      if (failedAttempts >= MAX_ATTEMPTS) sp.status = 'error';
      return failedAttempts >= MAX_ATTEMPTS;
    });
    if (locked) {
      recordAs(shown, 'LOGIN_BLOCKED', 'Sign-in refused while the account is locked');
      tr.log('WARN', 'Sign-in refused: account is locked', { user: shown });
      tr.end('error');
      return { ok: false, message: MSG.ACCOUNT_LOCKED };
    }

    const invalid = tr.span('validate input', (sp) => {
      const reason = !user ? MSG.USERNAME_REQUIRED : !password ? MSG.PASSWORD_REQUIRED : null;
      if (reason) { sp.status = 'warn'; sp.attrs.reason = reason; }
      return reason;
    });
    if (invalid) {
      tr.log('WARN', `Sign-in rejected: ${invalid}`, { user: shown });
      tr.end('warn');
      return { ok: false, message: invalid };
    }

    const valid = tr.span('verify credentials', (sp) => {
      const ok = !!USERS[user] && USERS[user].password === password;
      if (!ok) sp.status = 'error';
      return ok;
    });
    if (valid) {
      setAttempts(0);
      return { ok: true, user, trace: tr };
    }

    setAttempts(failedAttempts + 1);
    recordAs(user, 'LOGIN_FAILED', `Failed attempt ${failedAttempts} of ${MAX_ATTEMPTS}`);
    tr.log('WARN', 'Sign-in failed: invalid username or password', { user, attempt: failedAttempts, maxAttempts: MAX_ATTEMPTS });
    if (failedAttempts >= MAX_ATTEMPTS) {
      tr.span('lock account', (sp) => { sp.status = 'error'; });
      recordAs(user, 'ACCOUNT_LOCKED', `Locked after ${MAX_ATTEMPTS} failed attempts`);
      tr.log('WARN', `Account locked after ${MAX_ATTEMPTS} failed attempts`, { user });
      tr.end('error');
      return { ok: false, message: MSG.ACCOUNT_LOCKED };
    }
    tr.end('error');
    return { ok: false, message: MSG.INVALID_CREDENTIALS };
  }

  const normalize = (raw) => raw.trim().replace(/\s+/g, ' ');

  function addTask(raw, priority, due) {
    const tr = startTrace('task.create');
    const title = normalize(raw);

    const rejected = tr.span('validate', (sp) => {
      const reason = !title ? MSG.TASK_EMPTY : title.length > MAX_TITLE_LENGTH ? MSG.TASK_TOO_LONG : null;
      if (reason) { sp.status = 'warn'; sp.attrs.reason = reason; }
      return reason;
    }) || tr.span('check duplicates', (sp) => {
      sp.attrs.existing = tasks.length;
      if (tasks.some((t) => t.title.toLowerCase() === title.toLowerCase())) {
        sp.status = 'warn';
        sp.attrs.reason = MSG.TASK_DUPLICATE;
        return MSG.TASK_DUPLICATE;
      }
      return null;
    });
    if (rejected) {
      tr.log('WARN', `Task rejected: ${rejected}`, { length: title.length });
      tr.end('warn');
      return rejected;
    }

    const task = normalizeTask({ id: nextId(tasks), title, done: false, priority, due, createdBy: currentUser });
    tr.span('save', () => { tasks.push(task); saveTasks(); });
    tr.span('audit', () => record('TASK_CREATED', `"${task.title}" (${task.priority}${task.due ? ', due ' + task.due : ''})`));
    tr.set('task.id', task.id);
    tr.log('INFO', 'Task created', { taskId: task.id, priority: task.priority, due: task.due });
    tr.end();
    return null;
  }

  function summary() {
    if (tasks.length === 0) return MSG.NO_TASKS;
    const done = tasks.filter((t) => t.done).length;
    return `${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}, ${done} done`;
  }

  // ---- DOM helpers ----------------------------------------------------------------

  const $ = (id) => document.getElementById(id);
  const make = (tag, props = {}, children = []) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'text') node.textContent = v;
      else if (k === 'className') node.className = v;
      else if (k.startsWith('data-') || k.startsWith('aria-') || k === 'datetime' || k === 'role') node.setAttribute(k, v);
      else node[k] = v;
    }
    node.append(...children);
    return node;
  };

  function showError(node, message) { node.textContent = message; node.hidden = false; }
  function hideError(node) { node.textContent = ''; node.hidden = true; }

  const views = {
    login: $('login-view'),
    tasks: $('tasks-view'),
    dashboard: $('dashboard-view'),
    reports: $('reports-view'),
    audit: $('audit-view'),
    monitoring: $('monitoring-view'),
  };
  const header = $('app-header');
  const ADMIN_ONLY = ['audit', 'monitoring'];

  // ---- confirmation dialog -------------------------------------------------------

  const dialog = $('confirm-dialog');
  let onConfirm = null;

  function confirmAction(title, message, action) {
    $('confirm-title').textContent = title;
    $('confirm-message').textContent = message;
    onConfirm = action;
    dialog.showModal();
  }

  $('confirm-cancel').addEventListener('click', () => dialog.close('cancel'));
  $('confirm-ok').addEventListener('click', () => dialog.close('confirm'));
  dialog.addEventListener('close', () => {
    const action = onConfirm;
    onConfirm = null;
    if (dialog.returnValue === 'confirm' && action) action();
    dialog.returnValue = '';
  });

  // ---- routing ----------------------------------------------------------------------
  // The session, not the URL, decides what is shown. Protected routes while signed
  // out go to login; after login the user returns to the page they asked for.

  const ROUTES = ['tasks', 'dashboard', 'reports', 'audit', 'monitoring'];
  const RETURN_KEY = 'tasklab.returnTo';

  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [path, query = ''] = raw.split('?');
    return { path, params: new URLSearchParams(query) };
  }

  function go(hash, replace) {
    if (replace) history.replaceState(null, '', hash);
    else if (location.hash !== hash) history.pushState(null, '', hash);
  }

  function route() {
    const { path } = parseHash();

    if (!currentUser) {
      if (path && path !== 'login') {
        try { sessionStorage.setItem(RETURN_KEY, location.hash); } catch (e) { /* ignore */ }
      }
      if (path !== 'login') go('#/login', true);
      return show('login');
    }

    if (!ROUTES.includes(path)) {
      go('#/tasks', true);
      return show('tasks');
    }
    if (ADMIN_ONLY.includes(path) && !isAdmin()) {
      go('#/tasks', true);
      return show('tasks');
    }
    return show(path);
  }

  function show(name) {
    for (const [key, node] of Object.entries(views)) node.hidden = key !== name;
    header.hidden = name === 'login';

    if (name === 'login') {
      clearPrivateData();
      document.title = 'Sign in · TaskLab';
      return;
    }

    $('welcome').textContent = `Welcome, ${currentUser}`;
    $('role-badge').textContent = isAdmin() ? '' : 'Viewer';
    $('nav-audit').hidden = !isAdmin();
    $('nav-monitoring').hidden = !isAdmin();
    for (const link of document.querySelectorAll('.main-nav a')) {
      if (link.dataset.route === name) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    document.title = `${name[0].toUpperCase()}${name.slice(1)} · TaskLab`;

    if (name === 'tasks') renderTasks();
    if (name === 'dashboard') renderDashboard();
    if (name === 'reports') renderReports();
    if (name === 'audit') renderAudit();
    if (name === 'monitoring') renderMonitoring();
  }

  /** Remove (not just hide) the previous user's data from the page. */
  function clearPrivateData() {
    for (const id of ['task-list', 'results', 'schedules', 'runs', 'audit-list', 'log-list', 'trace-list']) $(id).replaceChildren();
    for (const id of ['welcome', 'summary', 'results-count', 'audit-count', 'logs-count', 'traces-count']) $(id).textContent = '';
  }

  // ---- tasks view ---------------------------------------------------------------------

  const taskInput = $('task-input');
  const taskError = $('task-error');

  function renderTasks() {
    const admin = isAdmin();
    $('task-form').hidden = !admin;
    $('readonly-note').hidden = admin;
    $('clear-completed').hidden = !admin;

    $('task-list').replaceChildren(...tasks.map((t) => renderTask(t, admin)));
    $('summary').textContent = summary();
    $('empty-state').hidden = tasks.length > 0;
    $('clear-completed').disabled = !tasks.some((t) => t.done);
  }

  function taskMeta(task) {
    const due = make('span', { text: formatDue(task.due), className: isOverdue(task) ? 'overdue' : '' });
    if (isOverdue(task)) due.textContent += ' · Overdue';
    return make('span', { className: 'meta' }, [
      make('span', { text: task.priority, className: `prio-${task.priority.toLowerCase()}` }),
      ' · ',
      due,
    ]);
  }

  function renderTask(task, admin) {
    const titleId = `task-title-${task.id}`;
    const checkbox = make('input', { type: 'checkbox', checked: task.done, disabled: !admin, 'aria-labelledby': titleId });
    checkbox.addEventListener('change', () => {
      const tr = startTrace('task.update', { 'task.id': task.id, change: checkbox.checked ? 'complete' : 'reopen' });
      tr.span('save', () => { task.done = checkbox.checked; saveTasks(); });
      tr.span('audit', () => record(task.done ? 'TASK_COMPLETED' : 'TASK_REOPENED', `"${task.title}"`,
        { before: task.done ? 'Open' : 'Done', after: task.done ? 'Done' : 'Open' }));
      tr.span('render', () => renderTasks());
      tr.log('INFO', task.done ? 'Task completed' : 'Task reopened', { taskId: task.id });
      tr.end();
    });

    const label = make('label', {}, [
      checkbox,
      make('span', { className: 'text' }, [make('span', { id: titleId, className: 'title', text: task.title }), taskMeta(task)]),
    ]);

    const li = make('li', { className: 'task' + (task.done ? ' done' : '') }, [label]);
    if (admin) {
      const del = make('button', { type: 'button', className: 'delete', text: '🗑', 'aria-label': `Delete ${task.title}` });
      del.addEventListener('click', () =>
        confirmAction('Delete task?', `"${task.title}" will be removed.`, () => {
          const tr = startTrace('task.delete', { 'task.id': task.id });
          tr.span('save', () => { tasks = tasks.filter((t) => t.id !== task.id); saveTasks(); });
          tr.span('audit', () => record('TASK_DELETED', `"${task.title}"`));
          tr.span('render', () => renderTasks());
          tr.log('INFO', 'Task deleted', { taskId: task.id });
          tr.end();
        }));
      li.append(del);
    }
    return li;
  }

  $('task-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (!isAdmin()) return;
    const error = addTask(taskInput.value, $('task-priority').value, $('task-due').value || null);
    if (error) {
      showError(taskError, error);
    } else {
      taskInput.value = '';
      $('task-due').value = '';
      $('task-priority').value = 'Medium';
      hideError(taskError);
      renderTasks();
    }
  });

  $('clear-completed').addEventListener('click', () => {
    const tr = startTrace('task.clear_completed');
    const removed = tasks.filter((t) => t.done);
    tr.span('save', () => { tasks = tasks.filter((t) => !t.done); saveTasks(); });
    tr.span('audit', () => record('TASKS_CLEARED', `${removed.length} completed ${removed.length === 1 ? 'task' : 'tasks'} removed`));
    tr.span('render', () => renderTasks());
    tr.log('INFO', 'Completed tasks cleared', { removed: removed.length });
    tr.end();
  });

  // ---- dashboard -------------------------------------------------------------------------

  const FILTER_DEFAULTS = { status: 'all', priority: 'all', from: '', to: '', q: '' };
  const filterInputs = {
    status: $('f-status'), priority: $('f-priority'), from: $('f-from'), to: $('f-to'), q: $('f-q'),
  };
  let shownCount = PAGE_SIZE;

  function readFilters() {
    const { params } = parseHash();
    const f = { ...FILTER_DEFAULTS };
    for (const key of Object.keys(f)) if (params.has(key)) f[key] = params.get(key);
    return f;
  }

  function applyFilters(f) {
    const q = f.q.trim().toLowerCase();
    return tasks
      .filter((t) => f.status === 'all' || (f.status === 'done' ? t.done : !t.done))
      .filter((t) => f.priority === 'all' || t.priority.toLowerCase() === f.priority)
      .filter((t) => !f.from || (t.due !== null && t.due >= f.from))
      .filter((t) => !f.to || (t.due !== null && t.due <= f.to))
      .filter((t) => !q || t.title.toLowerCase().includes(q))
      .sort((a, b) => {
        if (a.due !== b.due) {
          if (a.due === null) return 1;
          if (b.due === null) return -1;
          return a.due < b.due ? -1 : 1;
        }
        return a.title.localeCompare(b.title);
      });
  }

  function writeFilters() {
    const params = new URLSearchParams();
    for (const [key, input] of Object.entries(filterInputs)) {
      const value = input.value;
      if (value && value !== FILTER_DEFAULTS[key]) params.set(key, value);
    }
    const qs = params.toString();
    const tr = startTrace('dashboard.filter', { filters: qs || '(none)' });
    tr.span('update URL', () => history.replaceState(null, '', '#/dashboard' + (qs ? '?' + qs : '')));
    shownCount = PAGE_SIZE;
    tr.span('apply filters and render', (sp) => { renderDashboard(); sp.attrs.matches = Number($('stat-total').textContent); });
    tr.end();
  }

  function renderDashboard() {
    const f = readFilters();
    for (const [key, input] of Object.entries(filterInputs)) {
      if (input.value !== f[key]) input.value = f[key];
    }
    const matches = applyFilters(f);

    $('stat-total').textContent = matches.length;
    $('stat-open').textContent = matches.filter((t) => !t.done).length;
    $('stat-done').textContent = matches.filter((t) => t.done).length;
    $('stat-overdue').textContent = matches.filter(isOverdue).length;

    const visible = matches.slice(0, shownCount);
    $('results-count').textContent = `Showing ${visible.length} of ${matches.length} ${matches.length === 1 ? 'task' : 'tasks'}`;
    $('results-empty').hidden = matches.length > 0;
    $('results').replaceChildren(...visible.map((t) =>
      make('li', {}, [
        make('span', { className: 'name', text: t.title }),
        make('span', { className: 'meta status', text: t.done ? 'Done' : 'Open' }),
        taskMeta(t),
      ])));
    $('show-more').hidden = matches.length <= shownCount;
    $('export-csv').disabled = matches.length === 0;
  }

  for (const input of Object.values(filterInputs)) {
    input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', writeFilters);
    if (input.type === 'date') input.addEventListener('change', writeFilters);
  }
  $('filters').addEventListener('submit', (e) => e.preventDefault());

  $('clear-filters').addEventListener('click', () => {
    for (const [key, input] of Object.entries(filterInputs)) input.value = FILTER_DEFAULTS[key];
    writeFilters();
  });

  $('show-more').addEventListener('click', () => {
    shownCount += PAGE_SIZE;
    renderDashboard();
  });

  // ---- CSV export -------------------------------------------------------------------------

  function csvCell(value) {
    const s = String(value ?? '');
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function toCsv(list) {
    const rows = [['Title', 'Status', 'Priority', 'Due date', 'Overdue', 'Created by']];
    for (const t of list) {
      rows.push([t.title, t.done ? 'Done' : 'Open', t.priority, t.due || '', isOverdue(t) ? 'Yes' : 'No', t.createdBy]);
    }
    // The BOM makes Excel read accented characters correctly.
    return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }

  $('export-csv').addEventListener('click', () => {
    const tr = startTrace('report.export');
    const f = readFilters();
    const matches = tr.span('apply filters', (sp) => { const m = applyFilters(f); sp.attrs.rows = m.length; return m; });
    const csv = tr.span('build CSV', (sp) => { const text = toCsv(matches); sp.attrs.bytes = text.length; return text; });
    tr.span('download', () => {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const link = make('a', { href: URL.createObjectURL(blob), download: `tasklab-tasks-${todayLocal()}.csv` });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
    });
    const active = Object.entries(f).filter(([k, v]) => v && v !== FILTER_DEFAULTS[k]).map(([k, v]) => `${k}=${v}`);
    tr.span('audit', () => record('REPORT_EXPORTED', `CSV with ${matches.length} ${matches.length === 1 ? 'row' : 'rows'}` +
      (active.length ? ` (filters: ${active.join(', ')})` : ' (no filters)')));
    tr.log('INFO', 'CSV exported', { rows: matches.length, filters: active.join(', ') || 'none' });
    tr.end();
  });

  // ---- reports and schedules ------------------------------------------------------------

  const dayField = $('s-day');
  for (let d = 1; d <= 28; d++) dayField.append(make('option', { value: String(d), text: String(d) }));

  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if ([...$('s-zone').options].some((o) => o.value === zone)) $('s-zone').value = zone;
  } catch (e) { /* keep the default */ }

  function syncFrequencyFields() {
    const freq = $('s-frequency').value;
    $('s-weekday-field').hidden = freq !== 'weekly';
    $('s-day-field').hidden = freq !== 'monthly';
  }
  $('s-frequency').addEventListener('change', syncFrequencyFields);

  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function describeSchedule(s) {
    const when =
      s.frequency === 'daily' ? 'Daily' :
      s.frequency === 'weekly' ? `Weekly on ${WEEKDAYS[Number(s.weekday)]}` :
      `Monthly on day ${s.dayOfMonth}`;
    return `${when} at ${s.time} (${s.timeZone})`;
  }

  function saveSchedules() { store.saveList(KEYS.schedules, schedules); }

  function renderReports() {
    const admin = isAdmin();
    $('schedule-form').hidden = !admin;
    $('reports-readonly').hidden = admin;
    syncFrequencyFields();

    const now = Date.now();
    $('schedules-empty').hidden = schedules.length > 0;
    $('schedules').replaceChildren(...schedules.map((s) => {
      const next = s.paused ? null : nextRun(s, now);
      const nextLine = s.paused
        ? make('span', { className: 'paused', text: 'Paused' })
        : make('span', {}, [
            'Next run: ',
            make('time', { datetime: new Date(next).toISOString(), text: formatInZone(next, s.timeZone) }),
            ` (${new Date(next).toISOString().slice(11, 16)} UTC)`,
          ]);

      const item = make('li', { 'aria-label': s.name }, [
        make('span', { className: 'name', text: s.name }),
        make('span', { className: 'meta', text: describeSchedule(s) }),
        make('div', { className: 'next' }, [nextLine]),
      ]);

      if (admin) {
        const runNow = make('button', { type: 'button', className: 'secondary small', text: 'Run now' });
        runNow.addEventListener('click', () => runSchedule(s));
        const toggle = make('button', { type: 'button', className: 'secondary small', text: s.paused ? 'Resume' : 'Pause' });
        toggle.addEventListener('click', () => {
          const tr = startTrace('schedule.update', { schedule: s.name, change: s.paused ? 'resume' : 'pause' });
          tr.span('save', () => { s.paused = !s.paused; saveSchedules(); });
          tr.span('audit', () => record(s.paused ? 'SCHEDULE_PAUSED' : 'SCHEDULE_RESUMED', `"${s.name}"`));
          tr.span('render', () => renderReports());
          tr.log('INFO', s.paused ? 'Schedule paused' : 'Schedule resumed', { schedule: s.name });
          tr.end();
        });
        const del = make('button', { type: 'button', className: 'secondary small', text: 'Delete' });
        del.addEventListener('click', () =>
          confirmAction('Delete schedule?', `"${s.name}" will stop being delivered.`, () => {
            const tr = startTrace('schedule.delete', { schedule: s.name });
            tr.span('save', () => { schedules = schedules.filter((x) => x.id !== s.id); saveSchedules(); });
            tr.span('audit', () => record('SCHEDULE_DELETED', `"${s.name}"`));
            tr.span('render', () => renderReports());
            tr.log('INFO', 'Schedule deleted', { schedule: s.name });
            tr.end();
          }));
        item.append(make('div', { className: 'schedule-actions' }, [runNow, toggle, del]));
      }
      return item;
    }));

    const ordered = [...runs].sort((a, b) => b.id - a.id);
    $('runs-empty').hidden = ordered.length > 0;
    $('runs').replaceChildren(...ordered.map((r) =>
      make('li', {}, [
        make('span', { className: 'name', text: `${r.name}: ${r.status}` }),
        make('span', { className: 'meta', text: `${r.rows} ${r.rows === 1 ? 'row' : 'rows'} · ` }),
        make('time', { className: 'meta', datetime: r.at, text: formatLocal(r.at) }),
      ])));
  }

  /** Delivers a report immediately (the "test hook" instead of waiting for the schedule). */
  function runSchedule(s) {
    const tr = startTrace('report.deliver', { schedule: s.name, trigger: 'manual' });
    const rows = tr.span('collect rows', (sp) => { sp.attrs.rows = tasks.length; return tasks.length; });
    const run = { id: nextId(runs), scheduleId: s.id, name: s.name, at: new Date().toISOString(), rows, status: 'Delivered' };
    tr.span('deliver', () => { runs.push(run); store.saveList(KEYS.runs, runs); });
    tr.span('audit', () => record('REPORT_RUN', `"${s.name}" delivered with ${run.rows} ${run.rows === 1 ? 'row' : 'rows'}`));
    tr.span('render', () => renderReports());
    tr.log('INFO', 'Report delivered', { schedule: s.name, rows });
    tr.end();
  }

  $('schedule-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (!isAdmin()) return;
    const error = $('schedule-error');
    const name = normalize($('s-name').value);
    const time = $('s-time').value;
    const tr = startTrace('schedule.create');
    const message = tr.span('validate', (sp) => {
      let m = null;
      if (!name) m = MSG.SCHEDULE_NAME_REQUIRED;
      else if (name.length > MAX_TITLE_LENGTH) m = MSG.SCHEDULE_NAME_TOO_LONG;
      else if (schedules.some((s) => s.name.toLowerCase() === name.toLowerCase())) m = MSG.SCHEDULE_DUPLICATE;
      else if (!/^\d{2}:\d{2}$/.test(time)) m = MSG.SCHEDULE_TIME_REQUIRED;
      if (m) { sp.status = 'warn'; sp.attrs.reason = m; }
      return m;
    });
    if (message) {
      tr.log('WARN', `Schedule rejected: ${message}`, {});
      tr.end('warn');
      return showError(error, message);
    }

    const s = {
      id: nextId(schedules),
      name,
      frequency: $('s-frequency').value,
      time,
      weekday: Number($('s-weekday').value),
      dayOfMonth: Number($('s-day').value),
      timeZone: $('s-zone').value,
      paused: false,
      createdBy: currentUser,
    };
    const next = tr.span('calculate next run', (sp) => {
      const at = nextRun(s, Date.now());
      sp.attrs.nextRunUtc = at ? new Date(at).toISOString() : null;
      return sp.attrs.nextRunUtc;
    });
    tr.span('save', () => { schedules.push(s); saveSchedules(); });
    tr.span('audit', () => record('SCHEDULE_CREATED', `"${s.name}": ${describeSchedule(s)}`));
    hideError(error);
    $('s-name').value = '';
    tr.span('render', () => renderReports());
    tr.log('INFO', 'Schedule created', { schedule: s.name, frequency: s.frequency, timeZone: s.timeZone, nextRunUtc: next });
    tr.end();
  });

  // ---- audit view ----------------------------------------------------------------------------

  const auditInputs = { action: $('a-action'), user: $('a-user'), q: $('a-q') };

  function renderAudit() {
    // Rebuild the option lists from the data, keeping the current choice.
    const fill = (select, values, allLabel, label = (v) => v) => {
      const current = select.value;
      select.replaceChildren(make('option', { value: 'all', text: allLabel }),
        ...values.map((v) => make('option', { value: v, text: label(v) })));
      select.value = values.includes(current) ? current : 'all';
    };
    fill(auditInputs.action, [...new Set(audit.map((e) => e.action))].sort(), 'All actions', (a) => AUDIT_LABELS[a] || a);
    fill(auditInputs.user, [...new Set(audit.map((e) => e.user))].sort(), 'All users');

    const action = auditInputs.action.value;
    const user = auditInputs.user.value;
    const q = auditInputs.q.value.trim().toLowerCase();
    const list = audit
      .filter((e) => action === 'all' || e.action === action)
      .filter((e) => user === 'all' || e.user === user)
      .filter((e) => !q || `${e.details} ${e.before || ''} ${e.after || ''}`.toLowerCase().includes(q))
      .sort((a, b) => b.id - a.id);

    $('audit-count').textContent = `${list.length} ${list.length === 1 ? 'entry' : 'entries'}`;
    $('audit-list').replaceChildren(...list.map((e) => {
      const children = [
        make('div', { className: 'head' }, [
          make('span', { className: 'action', text: AUDIT_LABELS[e.action] || e.action }),
          make('span', { className: 'who', text: e.user }),
          make('time', { datetime: e.at, text: formatLocal(e.at) }),
        ]),
        make('div', { className: 'details', text: e.details }),
      ];
      if (e.before !== undefined) {
        children.push(make('div', { className: 'change', text: `${e.before} → ${e.after}` }));
      }
      return make('li', { 'data-action': e.action }, children);
    }));
  }

  for (const input of Object.values(auditInputs)) {
    input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', renderAudit);
  }
  $('audit-filters').addEventListener('submit', (e) => e.preventDefault());

  // ---- monitoring view -------------------------------------------------------------------------

  const monitorInputs = { level: $('m-level'), q: $('m-q'), status: $('m-status'), name: $('m-name') };
  const MAX_SHOWN_LOGS = 100;
  const MAX_SHOWN_TRACES = 50;
  let selectedTraceId = null;

  const fmtMs = (ms) => (Math.round(ms * 10) / 10).toFixed(1);
  const timeOnly = (iso) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(iso));

  function percentile(values, p) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
  }

  function contextText(context) {
    return Object.entries(context || {})
      .filter(([k, v]) => k !== 'stack' && v !== null && v !== undefined && v !== '')
      .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join('  ');
  }

  function renderMonitoring() {
    const durations = traces.map((t) => t.duration || 0);
    $('m-traces').textContent = traces.length;
    $('m-errors').textContent = logs.filter((l) => l.level === 'ERROR').length;
    $('m-warnings').textContent = logs.filter((l) => l.level === 'WARN').length;
    $('m-avg').textContent = fmtMs(durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0);
    $('m-p95').textContent = fmtMs(percentile(durations, 95));

    // Logs, newest first
    const level = monitorInputs.level.value;
    const q = monitorInputs.q.value.trim().toLowerCase();
    const matchingLogs = logs
      .filter((l) => level === 'all' || l.level === level)
      .filter((l) => !q || `${l.message} ${contextText(l.context)} ${l.user}`.toLowerCase().includes(q))
      .sort((a, b) => b.id - a.id);
    const shownLogs = matchingLogs.slice(0, MAX_SHOWN_LOGS);
    $('logs-count').textContent = `Showing ${shownLogs.length} of ${matchingLogs.length} log ${matchingLogs.length === 1 ? 'entry' : 'entries'}`;
    $('log-list').replaceChildren(...shownLogs.map((l) => {
      const row = make('li', { className: `log level-${l.level.toLowerCase()}`, 'data-level': l.level }, [
        make('div', { className: 'log-head' }, [
          make('span', { className: `pill pill-${l.level.toLowerCase()}`, text: l.level }),
          make('time', { datetime: l.at, text: timeOnly(l.at) }),
          make('span', { className: 'who', text: l.user }),
        ]),
        make('div', { className: 'log-message', text: l.message }),
      ]);
      const ctx = contextText(l.context);
      if (ctx) row.append(make('div', { className: 'log-context', text: ctx }));
      if (l.context && l.context.stack) row.append(make('pre', { className: 'log-stack', text: l.context.stack }));
      if (l.traceId) {
        const link = make('button', { type: 'button', className: 'link trace-link', text: `Trace ${l.traceId.slice(0, 8)}`, 'aria-label': `Open trace ${l.traceId}` });
        link.addEventListener('click', () => openTrace(l.traceId));
        row.append(link);
      }
      return row;
    }));

    // Operation filter options come from the data
    const names = [...new Set(traces.map((t) => t.name))].sort();
    const currentName = monitorInputs.name.value;
    monitorInputs.name.replaceChildren(make('option', { value: 'all', text: 'All operations' }),
      ...names.map((n) => make('option', { value: n, text: n })));
    monitorInputs.name.value = names.includes(currentName) ? currentName : 'all';

    // Traces, newest first
    const status = monitorInputs.status.value;
    const opName = monitorInputs.name.value;
    const matchingTraces = traces
      .filter((t) => status === 'all' || t.status === status)
      .filter((t) => opName === 'all' || t.name === opName)
      .slice().reverse();
    const shownTraces = matchingTraces.slice(0, MAX_SHOWN_TRACES);
    $('traces-count').textContent = `Showing ${shownTraces.length} of ${matchingTraces.length} ${matchingTraces.length === 1 ? 'trace' : 'traces'}`;
    $('trace-list').replaceChildren(...shownTraces.map(renderTrace));
  }

  function renderTrace(t) {
    const open = t.traceId === selectedTraceId;
    const toggle = make('button', { type: 'button', className: 'trace-toggle', 'aria-expanded': String(open), 'aria-controls': `trace-${t.traceId}` }, [
      make('span', { className: 'trace-name', text: t.name }),
      make('span', { className: `pill pill-${t.status}`, text: t.status }),
      make('span', { className: 'trace-meta', text: `${fmtMs(t.duration || 0)} ms · ${t.spans.length} ${t.spans.length === 1 ? 'step' : 'steps'} · ${timeOnly(t.at)}` }),
    ]);
    toggle.addEventListener('click', () => {
      selectedTraceId = open ? null : t.traceId;
      renderMonitoring();
    });

    const total = Math.max(t.duration || 0, ...t.spans.map((s) => s.start + s.duration), 0.001);
    const detail = make('div', { id: `trace-${t.traceId}`, className: 'trace-detail', role: 'region', 'aria-label': `Trace ${t.traceId}` }, [
      make('div', { className: 'trace-info', text: `Trace ${t.traceId} · user ${t.user} · ${contextText(t.attrs) || 'no attributes'}` }),
      make('ol', { className: 'waterfall', 'aria-label': 'Steps' }, t.spans.map((s) => {
        const bar = make('span', { className: `bar bar-${s.status}` });
        bar.style.left = `${(s.start / total) * 100}%`;
        bar.style.width = `max(3px, ${(s.duration / total) * 100}%)`;
        const extras = contextText(s.attrs);
        return make('li', { className: `span span-${s.status}`, 'data-status': s.status }, [
          make('span', { className: 'span-name', text: s.name }),
          make('span', { className: 'track' }, [bar]),
          make('span', { className: 'span-ms', text: `${fmtMs(s.duration)} ms` }),
          ...(extras ? [make('span', { className: 'span-attrs', text: extras })] : []),
        ]);
      })),
    ]);
    detail.hidden = !open;
    return make('li', { className: `trace trace-${t.status}`, 'data-trace-id': t.traceId }, [toggle, detail]);
  }

  function openTrace(traceId) {
    selectedTraceId = traceId;
    monitorInputs.status.value = 'all';
    monitorInputs.name.value = 'all';
    renderMonitoring();
    const region = document.getElementById(`trace-${traceId}`);
    if (region) {
      region.scrollIntoView({ block: 'center' });
    } else {
      $('traces-count').textContent += ' · that trace is no longer kept';
    }
  }

  for (const input of Object.values(monitorInputs)) {
    input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', renderMonitoring);
  }
  for (const id of ['log-filters', 'trace-filters']) $(id).addEventListener('submit', (e) => e.preventDefault());

  $('m-trigger').addEventListener('click', () => {
    // Deliberately throws outside the click handler, like a real bug in async code would.
    // (A microtask rather than a timer, so it also fires while tests freeze the clock.)
    queueMicrotask(() => { throw new Error('Simulated failure triggered from the Monitoring page'); });
  });

  // ---- login and logout ----------------------------------------------------------------------

  $('login-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const result = login($('username').value, $('password').value);
    if (!result.ok) {
      showError($('login-error'), result.message);
      $('password').value = '';
      return;
    }
    hideError($('login-error'));
    $('login-form').reset();
    const tr = result.trace;
    tr.span('start session', () => {
      setUser(result.user);
      record('LOGIN', `Signed in as ${USERS[result.user].role}`);
    });
    tr.as(result.user);
    tr.log('INFO', 'Signed in', { role: USERS[result.user].role });
    tr.end('ok');

    let target = '#/tasks';
    try {
      target = sessionStorage.getItem(RETURN_KEY) || target;
      sessionStorage.removeItem(RETURN_KEY);
    } catch (e) { /* ignore */ }
    location.hash = target;
    route();
  });

  $('logout').addEventListener('click', () => {
    const tr = startTrace('auth.logout');
    tr.span('audit', () => record('LOGOUT', 'Signed out'));
    tr.log('INFO', 'Signed out', {});
    tr.span('end session', () => setUser(null));
    tr.end();
    hideError(taskError);
    taskInput.value = '';
    try { sessionStorage.removeItem(RETURN_KEY); } catch (e) { /* ignore */ }
    location.replace('#/login');
    route();
  });

  window.addEventListener('hashchange', route);
  window.addEventListener('storage', () => {
    // Keep tabs in sync: another tab logged out or changed data.
    loadAll();
    route();
  });

  // Page load is traced too: how long reading storage and drawing the first screen took.
  const boot = startTrace('app.load');
  boot.span('load storage', (sp) => {
    loadAll();
    sp.attrs.tasks = tasks.length;
  });
  boot.as(currentUser || '(signed out)');
  boot.span('first render', () => route());
  boot.set('route', parseHash().path || 'login');
  boot.log('INFO', 'App loaded', { route: parseHash().path || 'login' });
  boot.end();
})();
