/*
 * TaskLab (mobile web).
 * - Login with a 3-strike lockout and two roles (admin, viewer)
 * - Tasks with priority and due date
 * - Dashboard with filters kept in the URL, paging and CSV export
 * - Scheduled reports with time zones (daylight saving aware) and delivery history
 * - Audit log of every important action, read-only, with filters
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

  function loadAll() {
    const user = store.get(KEYS.user);
    currentUser = user && USERS[user] ? user : null;
    failedAttempts = Number(store.get(KEYS.attempts)) || 0;
    tasks = store.list(KEYS.tasks).map(normalizeTask);
    audit = store.list(KEYS.audit);
    schedules = store.list(KEYS.schedules);
    runs = store.list(KEYS.runs);
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
    if (failedAttempts >= MAX_ATTEMPTS) {
      recordAs(user || '(blank)', 'LOGIN_BLOCKED', 'Sign-in refused while the account is locked');
      return { ok: false, message: MSG.ACCOUNT_LOCKED };
    }
    if (!user) return { ok: false, message: MSG.USERNAME_REQUIRED };
    if (!password) return { ok: false, message: MSG.PASSWORD_REQUIRED };
    if (USERS[user] && USERS[user].password === password) {
      setAttempts(0);
      return { ok: true, user };
    }
    setAttempts(failedAttempts + 1);
    recordAs(user, 'LOGIN_FAILED', `Failed attempt ${failedAttempts} of ${MAX_ATTEMPTS}`);
    if (failedAttempts >= MAX_ATTEMPTS) {
      recordAs(user, 'ACCOUNT_LOCKED', `Locked after ${MAX_ATTEMPTS} failed attempts`);
      return { ok: false, message: MSG.ACCOUNT_LOCKED };
    }
    return { ok: false, message: MSG.INVALID_CREDENTIALS };
  }

  const normalize = (raw) => raw.trim().replace(/\s+/g, ' ');

  function addTask(raw, priority, due) {
    const title = normalize(raw);
    if (!title) return MSG.TASK_EMPTY;
    if (title.length > MAX_TITLE_LENGTH) return MSG.TASK_TOO_LONG;
    if (tasks.some((t) => t.title.toLowerCase() === title.toLowerCase())) return MSG.TASK_DUPLICATE;
    const task = normalizeTask({ id: nextId(tasks), title, done: false, priority, due, createdBy: currentUser });
    tasks.push(task);
    saveTasks();
    record('TASK_CREATED', `"${task.title}" (${task.priority}${task.due ? ', due ' + task.due : ''})`);
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
  };
  const header = $('app-header');

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

  const ROUTES = ['tasks', 'dashboard', 'reports', 'audit'];
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
    if (path === 'audit' && !isAdmin()) {
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
    for (const link of document.querySelectorAll('.main-nav a')) {
      if (link.dataset.route === name) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    document.title = `${name[0].toUpperCase()}${name.slice(1)} · TaskLab`;

    if (name === 'tasks') renderTasks();
    if (name === 'dashboard') renderDashboard();
    if (name === 'reports') renderReports();
    if (name === 'audit') renderAudit();
  }

  /** Remove (not just hide) the previous user's data from the page. */
  function clearPrivateData() {
    for (const id of ['task-list', 'results', 'schedules', 'runs', 'audit-list']) $(id).replaceChildren();
    for (const id of ['welcome', 'summary', 'results-count', 'audit-count']) $(id).textContent = '';
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
      task.done = checkbox.checked;
      saveTasks();
      record(task.done ? 'TASK_COMPLETED' : 'TASK_REOPENED', `"${task.title}"`,
        { before: task.done ? 'Open' : 'Done', after: task.done ? 'Done' : 'Open' });
      renderTasks();
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
          tasks = tasks.filter((t) => t.id !== task.id);
          saveTasks();
          record('TASK_DELETED', `"${task.title}"`);
          renderTasks();
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
    const removed = tasks.filter((t) => t.done);
    tasks = tasks.filter((t) => !t.done);
    saveTasks();
    record('TASKS_CLEARED', `${removed.length} completed ${removed.length === 1 ? 'task' : 'tasks'} removed`);
    renderTasks();
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
    history.replaceState(null, '', '#/dashboard' + (qs ? '?' + qs : ''));
    shownCount = PAGE_SIZE;
    renderDashboard();
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
    const f = readFilters();
    const matches = applyFilters(f);
    const blob = new Blob([toCsv(matches)], { type: 'text/csv;charset=utf-8' });
    const link = make('a', { href: URL.createObjectURL(blob), download: `tasklab-tasks-${todayLocal()}.csv` });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
    const active = Object.entries(f).filter(([k, v]) => v && v !== FILTER_DEFAULTS[k]).map(([k, v]) => `${k}=${v}`);
    record('REPORT_EXPORTED', `CSV with ${matches.length} ${matches.length === 1 ? 'row' : 'rows'}` +
      (active.length ? ` (filters: ${active.join(', ')})` : ' (no filters)'));
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
          s.paused = !s.paused;
          saveSchedules();
          record(s.paused ? 'SCHEDULE_PAUSED' : 'SCHEDULE_RESUMED', `"${s.name}"`);
          renderReports();
        });
        const del = make('button', { type: 'button', className: 'secondary small', text: 'Delete' });
        del.addEventListener('click', () =>
          confirmAction('Delete schedule?', `"${s.name}" will stop being delivered.`, () => {
            schedules = schedules.filter((x) => x.id !== s.id);
            saveSchedules();
            record('SCHEDULE_DELETED', `"${s.name}"`);
            renderReports();
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
    const run = { id: nextId(runs), scheduleId: s.id, name: s.name, at: new Date().toISOString(), rows: tasks.length, status: 'Delivered' };
    runs.push(run);
    store.saveList(KEYS.runs, runs);
    record('REPORT_RUN', `"${s.name}" delivered with ${run.rows} ${run.rows === 1 ? 'row' : 'rows'}`);
    renderReports();
  }

  $('schedule-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (!isAdmin()) return;
    const error = $('schedule-error');
    const name = normalize($('s-name').value);
    const time = $('s-time').value;
    let message = null;
    if (!name) message = MSG.SCHEDULE_NAME_REQUIRED;
    else if (name.length > MAX_TITLE_LENGTH) message = MSG.SCHEDULE_NAME_TOO_LONG;
    else if (schedules.some((s) => s.name.toLowerCase() === name.toLowerCase())) message = MSG.SCHEDULE_DUPLICATE;
    else if (!/^\d{2}:\d{2}$/.test(time)) message = MSG.SCHEDULE_TIME_REQUIRED;
    if (message) return showError(error, message);

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
    schedules.push(s);
    saveSchedules();
    record('SCHEDULE_CREATED', `"${s.name}": ${describeSchedule(s)}`);
    hideError(error);
    $('s-name').value = '';
    renderReports();
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
    setUser(result.user);
    record('LOGIN', `Signed in as ${USERS[result.user].role}`);

    let target = '#/tasks';
    try {
      target = sessionStorage.getItem(RETURN_KEY) || target;
      sessionStorage.removeItem(RETURN_KEY);
    } catch (e) { /* ignore */ }
    location.hash = target;
    route();
  });

  $('logout').addEventListener('click', () => {
    record('LOGOUT', 'Signed out');
    setUser(null);
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

  loadAll();
  route();
})();
