/*
 * TaskLab (mobile web). Same rules as the native Android TaskLab:
 * login with a 3-strike lockout, a task list with validation, a delete
 * confirmation, and everything persisted in localStorage.
 */
(function () {
  'use strict';

  const VALID_USERNAME = 'qa_user';
  const VALID_PASSWORD = 'Passw0rd!';
  const MAX_ATTEMPTS = 3;
  const MAX_TITLE_LENGTH = 40;

  const MSG = {
    USERNAME_REQUIRED: 'Username is required',
    PASSWORD_REQUIRED: 'Password is required',
    INVALID_CREDENTIALS: 'Invalid username or password',
    ACCOUNT_LOCKED: 'Account locked after 3 failed attempts',
    TASK_EMPTY: 'Task cannot be empty',
    TASK_TOO_LONG: 'Task must be 40 characters or fewer',
    TASK_DUPLICATE: 'Task already exists',
    NO_TASKS: 'No tasks yet',
  };

  // ---- storage ------------------------------------------------------------

  const KEYS = { user: 'tasklab.user', attempts: 'tasklab.failedAttempts', tasks: 'tasklab.tasks' };

  const store = {
    get(key) {
      try { return localStorage.getItem(key); } catch (e) { return null; }
    },
    set(key, value) {
      try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      } catch (e) { /* storage unavailable: app keeps working for this page view */ }
    },
  };

  let memoryUser = store.get(KEYS.user);
  let failedAttempts = Number(store.get(KEYS.attempts)) || 0;
  let tasks = loadTasks();

  function loadTasks() {
    try {
      const parsed = JSON.parse(store.get(KEYS.tasks) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function saveTasks() { store.set(KEYS.tasks, JSON.stringify(tasks)); }
  function setUser(user) { memoryUser = user; store.set(KEYS.user, user); }
  function setAttempts(n) { failedAttempts = n; store.set(KEYS.attempts, String(n)); }

  // ---- rules (mirror the Android AuthService and TaskList) ---------------

  function login(rawUser, password) {
    if (failedAttempts >= MAX_ATTEMPTS) return { ok: false, message: MSG.ACCOUNT_LOCKED };
    const user = rawUser.trim();
    if (!user) return { ok: false, message: MSG.USERNAME_REQUIRED };
    if (!password) return { ok: false, message: MSG.PASSWORD_REQUIRED };
    if (user === VALID_USERNAME && password === VALID_PASSWORD) {
      setAttempts(0);
      return { ok: true, user };
    }
    setAttempts(failedAttempts + 1);
    return {
      ok: false,
      message: failedAttempts >= MAX_ATTEMPTS ? MSG.ACCOUNT_LOCKED : MSG.INVALID_CREDENTIALS,
    };
  }

  const normalize = (raw) => raw.trim().replace(/\s+/g, ' ');

  function addTask(raw) {
    const title = normalize(raw);
    if (!title) return MSG.TASK_EMPTY;
    if (title.length > MAX_TITLE_LENGTH) return MSG.TASK_TOO_LONG;
    if (tasks.some((t) => t.title.toLowerCase() === title.toLowerCase())) return MSG.TASK_DUPLICATE;
    const nextId = tasks.reduce((max, t) => Math.max(max, t.id), 0) + 1;
    tasks.push({ id: nextId, title, done: false });
    saveTasks();
    return null;
  }

  function summary() {
    if (tasks.length === 0) return MSG.NO_TASKS;
    const done = tasks.filter((t) => t.done).length;
    return `${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}, ${done} done`;
  }

  // ---- DOM ----------------------------------------------------------------

  const $ = (id) => document.getElementById(id);
  const el = {
    loginView: $('login-view'),
    tasksView: $('tasks-view'),
    loginForm: $('login-form'),
    username: $('username'),
    password: $('password'),
    loginError: $('login-error'),
    welcome: $('welcome'),
    logout: $('logout'),
    taskForm: $('task-form'),
    taskInput: $('task-input'),
    taskError: $('task-error'),
    summary: $('summary'),
    empty: $('empty-state'),
    list: $('task-list'),
    clearCompleted: $('clear-completed'),
    dialog: $('delete-dialog'),
    dialogMessage: $('delete-message'),
    dialogCancel: $('delete-cancel'),
    dialogConfirm: $('delete-confirm'),
  };

  function showError(node, message) {
    node.textContent = message;
    node.hidden = false;
  }

  function hideError(node) {
    node.textContent = '';
    node.hidden = true;
  }

  // ---- routing --------------------------------------------------------------
  // The session, not the URL, decides which screen is shown. Visiting #/tasks
  // while logged out (e.g. pressing Back after logout) always lands on login.

  function route() {
    const wantsTasks = location.hash === '#/tasks';
    if (memoryUser && !wantsTasks) {
      history.replaceState(null, '', '#/tasks');
    } else if (!memoryUser && location.hash !== '#/login') {
      history.replaceState(null, '', '#/login');
    }
    if (memoryUser) showTasks();
    else showLogin();
  }

  function showLogin() {
    // Remove (not just hide) the previous user's data from the page.
    el.list.replaceChildren();
    el.welcome.textContent = '';
    el.summary.textContent = '';
    el.tasksView.hidden = true;
    el.loginView.hidden = false;
    document.title = 'Sign in · TaskLab';
  }

  function showTasks() {
    el.loginView.hidden = true;
    el.tasksView.hidden = false;
    el.welcome.textContent = `Welcome, ${memoryUser}`;
    document.title = 'Tasks · TaskLab';
    render();
  }

  function render() {
    el.list.replaceChildren(...tasks.map(renderTask));
    el.summary.textContent = summary();
    el.empty.hidden = tasks.length > 0;
    el.clearCompleted.disabled = !tasks.some((t) => t.done);
  }

  function renderTask(task) {
    const li = document.createElement('li');
    li.className = 'task' + (task.done ? ' done' : '');
    li.dataset.testid = 'task';

    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.done;
    checkbox.addEventListener('change', () => {
      task.done = checkbox.checked;
      saveTasks();
      render();
    });
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = task.title;
    label.append(checkbox, title);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'delete';
    del.setAttribute('aria-label', `Delete ${task.title}`);
    del.textContent = '🗑';
    del.addEventListener('click', () => confirmDelete(task));

    li.append(label, del);
    return li;
  }

  // ---- delete dialog --------------------------------------------------------

  let pendingDeleteId = null;

  function confirmDelete(task) {
    pendingDeleteId = task.id;
    el.dialogMessage.textContent = `"${task.title}" will be removed.`;
    el.dialog.showModal();
  }

  el.dialogCancel.addEventListener('click', () => el.dialog.close('cancel'));
  el.dialogConfirm.addEventListener('click', () => el.dialog.close('confirm'));
  el.dialog.addEventListener('close', () => {
    if (el.dialog.returnValue === 'confirm' && pendingDeleteId !== null) {
      tasks = tasks.filter((t) => t.id !== pendingDeleteId);
      saveTasks();
      render();
    }
    pendingDeleteId = null;
    el.dialog.returnValue = '';
  });

  // ---- events ---------------------------------------------------------------

  el.loginForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const result = login(el.username.value, el.password.value);
    if (result.ok) {
      hideError(el.loginError);
      el.loginForm.reset();
      setUser(result.user);
      location.hash = '#/tasks';
      route();
    } else {
      showError(el.loginError, result.message);
      el.password.value = '';
    }
  });

  el.taskForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const error = addTask(el.taskInput.value);
    if (error) {
      showError(el.taskError, error);
    } else {
      el.taskInput.value = '';
      hideError(el.taskError);
      render();
    }
  });

  el.clearCompleted.addEventListener('click', () => {
    tasks = tasks.filter((t) => !t.done);
    saveTasks();
    render();
  });

  el.logout.addEventListener('click', () => {
    setUser(null);
    hideError(el.taskError);
    el.taskInput.value = '';
    location.replace('#/login');
    route();
  });

  window.addEventListener('hashchange', route);
  window.addEventListener('storage', () => {
    // Keep tabs in sync: another tab logged out or changed tasks.
    memoryUser = store.get(KEYS.user);
    failedAttempts = Number(store.get(KEYS.attempts)) || 0;
    tasks = loadTasks();
    route();
  });

  route();
})();
