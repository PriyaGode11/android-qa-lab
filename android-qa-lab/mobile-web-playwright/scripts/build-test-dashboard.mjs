#!/usr/bin/env node
/**
 * Builds the test results dashboard (one static HTML page) from test reports.
 *
 *   node scripts/build-test-dashboard.mjs <results> <history.json|-> <output dir>
 *
 * - results      : Playwright's JSON report (a .json file), or a folder of JUnit XML reports
 *                  (Maven surefire/failsafe: every TEST-*.xml below it is read)
 * - history.json : results of earlier runs (for the trend chart); "-" or a missing file = no history
 * - output dir   : receives index.html and the updated history.json
 *
 * No dependencies. GitHub Actions environment variables (run number, commit…) are used when present.
 *
 * Optional settings (environment variables), so one script serves the mobile and desktop suites:
 *   DASHBOARD_TITLE   page title            (default "TaskLab Test Results")
 *   REPORT_DIR        sibling folder holding the Playwright HTML report (default "report")
 *   OTHER_LINK_HREF / OTHER_LINK_TEXT   an extra link, e.g. to the other suite's dashboard
 *   REPORT_LINK_TEXT  text of the main report link (default "Full report: screenshots, videos, traces")
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const [resultsPath, historyPath, outDir] = process.argv.slice(2);
if (!resultsPath || !outDir) {
  console.error('Usage: build-test-dashboard.mjs <results.json> <history.json|-> <output dir>');
  process.exit(1);
}

const isJUnitFolder = statSync(resultsPath).isDirectory();
const report = isJUnitFolder ? { suites: [], stats: {} } : JSON.parse(readFileSync(resultsPath, 'utf8'));
let history = [];
if (historyPath && historyPath !== '-' && existsSync(historyPath)) {
  try {
    const parsed = JSON.parse(readFileSync(historyPath, 'utf8'));
    if (Array.isArray(parsed)) history = parsed;
  } catch { /* corrupt or empty history: start again */ }
}

const env = process.env;
const TITLE = env.DASHBOARD_TITLE || 'TaskLab Test Results';
const REPORT_DIR = env.REPORT_DIR || 'report';
const run = {
  number: Number(env.GITHUB_RUN_NUMBER) || (history.length ? (history.at(-1).run || 0) + 1 : 1),
  date: report.stats?.startTime || new Date().toISOString(),
  sha: (env.GITHUB_SHA || '').slice(0, 7),
  branch: env.GITHUB_REF_NAME || 'local',
  event: env.GITHUB_EVENT_NAME || 'local',
  url: env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : '',
  commitUrl: env.GITHUB_SHA ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/commit/${env.GITHUB_SHA}` : '',
  durationMs: Math.round(report.stats?.duration || 0),
};

// ---- flatten the report into one row per test per device ----------------------------------

const AREAS = {
  'auth.spec.ts': 'Authentication', 'tasks.spec.ts': 'Tasks', 'session.spec.ts': 'Session',
  'mobile.spec.ts': 'Mobile experience', 'dashboard.spec.ts': 'Dashboard', 'reports.spec.ts': 'Reports',
  'audit.spec.ts': 'Audit log', 'roles.spec.ts': 'Roles', 'monitoring.spec.ts': 'Monitoring',
  // desktop suite
  'auth.setup.ts': 'Setup (saved sign-in)', 'e2e.spec.ts': 'End-to-end journeys', 'keyboard.spec.ts': 'Keyboard-only use',
  'accessibility.spec.ts': 'Accessibility', 'navigation.spec.ts': 'Browser navigation', 'tabs.spec.ts': 'Multiple tabs',
  'layout.spec.ts': 'Desktop layout',
};

const stripAnsi = (s) => String(s || '').replace(/\u001b\[[0-9;]*m/g, '');
const rows = [];

function walk(suite, file, titles) {
  const here = suite.title && !suite.title.endsWith('.ts') ? [...titles, suite.title] : titles;
  for (const spec of suite.specs || []) {
    for (const t of spec.tests || []) {
      const results = t.results || [];
      const lastResult = results.at(-1) || {};
      const outcome =
        t.status === 'skipped' ? 'skipped' :
        t.status === 'flaky' ? 'flaky' :
        t.status === 'unexpected' ? 'failed' : 'passed';
      const error = results.map((r) => r.error?.message || r.errors?.[0]?.message).filter(Boolean).at(-1);
      rows.push({
        file: basename(spec.file || file || ''),
        area: AREAS[basename(spec.file || file || '')] || basename(spec.file || file || 'Other'),
        title: spec.title,
        path: [...here, spec.title].join(' › '),
        device: t.projectName || 'default',
        outcome,
        duration: results.reduce((sum, r) => sum + (r.duration || 0), 0),
        retries: Math.max(0, results.length - 1),
        error: error ? stripAnsi(error).split('\n').slice(0, 8).join('\n') : '',
        lastStatus: lastResult.status || '',
      });
    }
  }
  for (const child of suite.suites || []) walk(child, suite.file || file, here);
}
for (const s of report.suites || []) walk(s, s.file, []);

// ---- JUnit XML (Java: surefire = unit and web-layer tests, failsafe = integration tests) ----

const JUNIT_GROUPS = { 'surefire-reports': 'Unit & web-layer tests', 'failsafe-reports': 'Integration tests (PostgreSQL)' };
const JAVA_AREAS = {
  TaskRulesTest: 'Unit: task rules', TaskServiceTest: 'Unit: service logic (Mockito)',
  TaskControllerTest: 'Web layer: controller + security (MockMvc)',
  TaskRepositoryIT: 'Database: repositories on PostgreSQL', TaskApiIT: 'API: full app over HTTP (REST Assured)',
};
const xmlDecode = (s) => String(s || '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).replace(/&amp;/g, '&');
const attr = (tag, name) => xmlDecode((tag.match(new RegExp(`\\b${name}="([^"]*)"`)) || [])[1]);

function junitFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...junitFiles(full));
    else if (/^TEST-.*\.xml$/.test(entry.name)) out.push(full);
  }
  return out;
}

if (isJUnitFolder) {
  let durationMs = 0;
  for (const file of junitFiles(resultsPath)) {
    const folder = Object.keys(JUNIT_GROUPS).find((f) => file.includes(f));
    const device = folder ? JUNIT_GROUPS[folder] : 'Tests';
    const xml = readFileSync(file, 'utf8');
    for (const m of xml.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
      const head = m[1];
      const body = m[2] || '';
      const className = attr(head, 'classname');
      const simple = className.split('.').pop().split('$')[0];
      const name = attr(head, 'name');
      const failure = body.match(/<(failure|error)\b([^>]*)(?:\/>|>([\s\S]*?)<\/\1>)/);
      const outcome = failure ? 'failed' : /<skipped\b/.test(body) ? 'skipped' : /<(flakyFailure|flakyError)\b/.test(body) ? 'flaky' : 'passed';
      const time = Number(attr(head, 'time')) * 1000 || 0;
      durationMs += time;
      const errorText = failure ? [attr(failure[2], 'message'), xmlDecode((failure[3] || '').replace(/<!\[CDATA\[|\]\]>/g, '')).trim()].filter(Boolean).join('\n') : '';
      rows.push({
        file: simple,
        area: JAVA_AREAS[simple] || simple,
        title: name,
        path: `${simple} › ${name}`,
        device,
        outcome,
        duration: time,
        retries: 0,
        error: errorText.split('\n').slice(0, 8).join('\n'),
        lastStatus: outcome,
      });
    }
  }
  run.durationMs = Math.round(durationMs);
}

const count = (list, outcome) => list.filter((r) => r.outcome === outcome).length;
const totals = {
  total: rows.length,
  passed: count(rows, 'passed'),
  failed: count(rows, 'failed'),
  flaky: count(rows, 'flaky'),
  skipped: count(rows, 'skipped'),
};
const executed = totals.total - totals.skipped;
const passRate = executed ? ((totals.passed + totals.flaky) / executed) * 100 : 0;

const groupBy = (key) => {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r[key])) map.set(r[key], []);
    map.get(r[key]).push(r);
  }
  return [...map.entries()].map(([name, list]) => ({
    name, total: list.length, passed: count(list, 'passed'), failed: count(list, 'failed'),
    flaky: count(list, 'flaky'), skipped: count(list, 'skipped'),
  }));
};
const byDevice = groupBy('device').sort((a, b) => a.name.localeCompare(b.name));
const areaOrder = [...Object.values(AREAS), ...Object.values(JAVA_AREAS)];
const byArea = groupBy('area').sort((a, b) => areaOrder.indexOf(a.name) - areaOrder.indexOf(b.name));
const failures = rows.filter((r) => r.outcome === 'failed');
const flaky = rows.filter((r) => r.outcome === 'flaky');
const slowest = rows.filter((r) => r.outcome !== 'skipped').sort((a, b) => b.duration - a.duration).slice(0, 8);

// ---- history (trend) -------------------------------------------------------------------------

const entry = { run: run.number, date: run.date, sha: run.sha, branch: run.branch, ...totals, durationMs: run.durationMs };
history = [...history.filter((h) => h.run !== entry.run), entry].slice(-50);

// ---- HTML ------------------------------------------------------------------------------------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);
const fmtDuration = (ms) => (ms >= 60000 ? `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s` : `${(ms / 1000).toFixed(1)}s`);
const reportLink = (r) => (isJUnitFolder ? `../${REPORT_DIR}/index.html` : `../${REPORT_DIR}/index.html#?q=${encodeURIComponent(r.title)}`);
const dateText = new Date(run.date).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC';
const overall = totals.failed ? 'failed' : totals.flaky ? 'flaky' : 'passed';
const overallText = { passed: 'All tests passed', flaky: 'Passed with flaky tests', failed: `${totals.failed} failed` }[overall];

function stackBar(g) {
  const executedHere = g.total - g.skipped || 1;
  const seg = (n, cls) => (n ? `<span class="seg ${cls}" style="width:${(n / executedHere) * 100}%"></span>` : '');
  return `<div class="stack" role="img" aria-label="${g.passed} passed, ${g.failed} failed, ${g.flaky} flaky">${seg(g.passed, 'ok')}${seg(g.flaky, 'flaky')}${seg(g.failed, 'bad')}</div>`;
}

function trendSvg() {
  const runs = history.slice(-30);
  if (runs.length < 2) return '<p class="muted">The trend appears after the second run. Each push to main adds a point.</p>';
  const W = 720, H = 180, padL = 40, padB = 26, padT = 10, padR = 8;
  const maxTotal = Math.max(...runs.map((r) => r.total - r.skipped), 1);
  const bw = (W - padL - padR) / runs.length;
  const y = (v) => padT + (H - padT - padB) * (1 - v / maxTotal);
  const ticks = [0, Math.round(maxTotal / 2), maxTotal];
  const grid = ticks.map((t) => `<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${padL - 6}" y="${y(t) + 4}" class="axis" text-anchor="end">${t}</text>`).join('');
  const bars = runs.map((r, i) => {
    const x = padL + i * bw + 2;
    const w = Math.max(2, bw - 4);
    const ok = r.passed + (r.flaky || 0);
    const bad = r.failed;
    const label = i === runs.length - 1 || i % Math.ceil(runs.length / 8) === 0
      ? `<text x="${x + w / 2}" y="${H - 8}" class="axis" text-anchor="middle">#${r.run}</text>` : '';
    return `<g><title>Run #${r.run} (${r.sha || r.branch}): ${ok} passed, ${bad} failed</title>` +
      `<rect x="${x}" y="${y(ok)}" width="${w}" height="${y(0) - y(ok)}" class="ok"/>` +
      (bad ? `<rect x="${x}" y="${y(ok + bad)}" width="${w}" height="${y(ok) - y(ok + bad)}" class="bad"/>` : '') +
      `${label}</g>`;
  }).join('');
  return `<div class="chart-wrap"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Passed and failed tests over the last ${runs.length} runs">${grid}${bars}</svg></div>
  <p class="legend"><span class="key ok"></span>Passed <span class="key bad"></span>Failed · last ${runs.length} runs</p>`;
}

const tile = (label, value, cls = '') => `<div class="tile ${cls}"><span class="v">${value}</span><span class="l">${label}</span></div>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(TITLE)}</title>
<style>
  :root {
    --bg: #f5f6fa; --surface: #ffffff; --text: #1d2130; --muted: #5d6478; --border: #dcdfe8;
    --accent: #4f46e5; --ok: #2e7d4f; --bad: #c62828; --flaky: #b26a00; --grid: #e6e8ef;
    --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      color-scheme: dark;
      --bg: #12141b; --surface: #1b1e28; --text: #eceef4; --muted: #a2a8b8; --border: #333847;
      --accent: #8b85ff; --ok: #5fcf8a; --bad: #ff7a73; --flaky: #f0b45a; --grid: #2a2e3b;
    }
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --bg: #12141b; --surface: #1b1e28; --text: #eceef4; --muted: #a2a8b8; --border: #333847;
    --accent: #8b85ff; --ok: #5fcf8a; --bad: #ff7a73; --flaky: #f0b45a; --grid: #2a2e3b;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 1120px; margin: 0 auto; padding: 24px max(16px, env(safe-area-inset-right)) 48px max(16px, env(safe-area-inset-left)); }
  h1 { font-size: 1.6rem; margin: 0; text-wrap: balance; }
  h2 { font-size: 1.1rem; margin: 32px 0 12px; }
  a { color: var(--accent); }
  .muted { color: var(--muted); }
  header { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; }
  .status { font: 700 .8rem/1 var(--mono); text-transform: uppercase; letter-spacing: .06em; padding: 6px 10px; border-radius: 999px; border: 1.5px solid currentColor; }
  .status.passed { color: var(--ok); } .status.failed { color: var(--bad); } .status.flaky { color: var(--flaky); }
  .meta { margin: 6px 0 0; color: var(--muted); font-size: .9rem; }
  .links { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
  .links a { display: inline-flex; align-items: center; min-height: 40px; padding: 0 14px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); text-decoration: none; font-weight: 600; }
  .links a.primary { background: var(--accent); color: var(--surface); border-color: var(--accent); }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin-top: 24px; }
  .tile { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; }
  .tile .v { font-size: 1.8rem; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.15; }
  .tile .l { color: var(--muted); font-size: .85rem; }
  .tile.bad .v { color: var(--bad); } .tile.ok .v { color: var(--ok); } .tile.flaky .v { color: var(--flaky); }
  .table-wrap { overflow-x: auto; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; }
  table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  th, td { text-align: left; padding: 10px 14px; border-top: 1px solid var(--border); white-space: nowrap; }
  thead th { border-top: none; color: var(--muted); font-size: .8rem; text-transform: uppercase; letter-spacing: .05em; font-weight: 600; }
  td.num, th.num { text-align: right; }
  td.bar { width: 40%; min-width: 140px; }
  .stack { display: flex; height: 10px; border-radius: 5px; overflow: hidden; background: var(--grid); }
  .seg.ok { background: var(--ok); } .seg.bad { background: var(--bad); } .seg.flaky { background: var(--flaky); }
  .zero { color: var(--muted); }
  .fail { background: var(--surface); border: 1px solid var(--border); border-left: 4px solid var(--bad); border-radius: 12px; padding: 12px 16px; margin-bottom: 10px; }
  .fail.flaky { border-left-color: var(--flaky); }
  .fail h3 { font-size: .95rem; margin: 0 0 2px; overflow-wrap: anywhere; }
  .fail .where { color: var(--muted); font-size: .85rem; }
  .fail pre { font: .78rem/1.45 var(--mono); white-space: pre-wrap; overflow-wrap: anywhere; margin: 8px 0; color: var(--bad); }
  .empty-ok { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px; color: var(--ok); font-weight: 600; }
  .chart-wrap { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 12px; overflow-x: auto; }
  svg { width: 100%; min-width: 480px; height: auto; display: block; }
  svg .grid { stroke: var(--grid); } svg .axis { fill: var(--muted); font: 11px var(--mono); }
  svg .ok { fill: var(--ok); } svg .bad { fill: var(--bad); }
  .legend { color: var(--muted); font-size: .85rem; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .key { width: 12px; height: 12px; border-radius: 3px; display: inline-block; } .key.ok { background: var(--ok); } .key.bad { background: var(--bad); margin-left: 10px; }
  footer { margin-top: 40px; color: var(--muted); font-size: .85rem; }
</style>
</head>
<body>
<main>
  <header>
    <h1>${esc(TITLE)}</h1>
    <span class="status ${overall}">${esc(overallText)}</span>
  </header>
  <p class="meta">Run #${run.number} · ${esc(dateText)} · ${run.commitUrl ? `commit <a href="${esc(run.commitUrl)}">${esc(run.sha)}</a>` : esc(run.branch)} · took ${fmtDuration(run.durationMs)} · ${isJUnitFolder ? 'JUnit 5 via Maven' : `Playwright on ${byDevice.filter((g) => g.name !== 'setup').length} ${byDevice.filter((g) => g.name !== 'setup').length === 1 ? 'browser' : 'browsers'}`}</p>
  <nav class="links" aria-label="Related pages">
    <a class="primary" href="../${REPORT_DIR}/index.html">${esc(env.REPORT_LINK_TEXT || 'Full report: screenshots, videos, traces')}</a>
    ${run.url ? `<a href="${esc(run.url)}">This run on GitHub</a>` : ''}
    <a href="../">Open the TaskLab app</a>
    ${env.OTHER_LINK_HREF ? `<a href="${esc(env.OTHER_LINK_HREF)}">${esc(env.OTHER_LINK_TEXT || 'Other results')}</a>` : ''}
  </nav>

  <section class="tiles" aria-label="Totals">
    ${tile('Test runs', totals.total)}
    ${tile('Passed', totals.passed, 'ok')}
    ${tile('Failed', totals.failed, totals.failed ? 'bad' : '')}
    ${tile('Flaky', totals.flaky, totals.flaky ? 'flaky' : '')}
    ${tile('Skipped', totals.skipped)}
    ${tile('Pass rate', `${pct(totals.passed + totals.flaky, executed)}%`, totals.failed ? 'bad' : 'ok')}
  </section>

  <h2>Failures</h2>
  ${failures.length ? failures.map((r) => `
  <article class="fail">
    <h3>${esc(r.path)}</h3>
    <div class="where">${esc(r.area)} · ${esc(r.device)}${r.retries ? ` · failed after ${r.retries} ${r.retries === 1 ? 'retry' : 'retries'}` : ''}</div>
    <pre>${esc(r.error || 'No error message recorded')}</pre>
    <a href="${reportLink(r)}">Open in the report (screenshot, video, trace)</a>
  </article>`).join('') : '<p class="empty-ok">No failures in this run.</p>'}

  ${flaky.length ? `<h2>Flaky (passed only on retry)</h2>${flaky.map((r) => `
  <article class="fail flaky">
    <h3>${esc(r.path)}</h3>
    <div class="where">${esc(r.area)} · ${esc(r.device)}</div>
    <a href="${reportLink(r)}">Open in the report</a>
  </article>`).join('')}` : ''}

  <h2>${isJUnitFolder ? 'By test level' : 'By device'}</h2>
  <div class="table-wrap"><table>
    <thead><tr><th>${isJUnitFolder ? 'Level' : 'Device'}</th><th class="num">Passed</th><th class="num">Failed</th><th class="num">Flaky</th><th class="num">Skipped</th><th class="num">Pass rate</th><th>Result</th></tr></thead>
    <tbody>${byDevice.map((g) => `<tr><td>${esc(g.name)}</td><td class="num">${g.passed}</td><td class="num ${g.failed ? '' : 'zero'}">${g.failed}</td><td class="num ${g.flaky ? '' : 'zero'}">${g.flaky}</td><td class="num ${g.skipped ? '' : 'zero'}">${g.skipped}</td><td class="num">${pct(g.passed + g.flaky, g.total - g.skipped)}%</td><td class="bar">${stackBar(g)}</td></tr>`).join('')}</tbody>
  </table></div>

  <h2>By area</h2>
  <div class="table-wrap"><table>
    <thead><tr><th>Area</th><th class="num">Test runs</th><th class="num">Passed</th><th class="num">Failed</th><th class="num">Flaky</th><th>Result</th></tr></thead>
    <tbody>${byArea.map((g) => `<tr><td>${esc(g.name)}</td><td class="num">${g.total}</td><td class="num">${g.passed}</td><td class="num ${g.failed ? '' : 'zero'}">${g.failed}</td><td class="num ${g.flaky ? '' : 'zero'}">${g.flaky}</td><td class="bar">${stackBar(g)}</td></tr>`).join('')}</tbody>
  </table></div>

  <h2>Trend</h2>
  ${trendSvg()}

  <h2>Slowest tests</h2>
  <div class="table-wrap"><table>
    <thead><tr><th>Test</th><th>${isJUnitFolder ? 'Level' : 'Device'}</th><th class="num">Time</th></tr></thead>
    <tbody>${slowest.map((r) => `<tr><td>${esc(r.title)}</td><td>${esc(r.device)}</td><td class="num">${fmtDuration(r.duration)}</td></tr>`).join('')}</tbody>
  </table></div>

  <footer>Generated from ${isJUnitFolder ? 'JUnit XML reports' : "Playwright's JSON report"} by scripts/build-test-dashboard.mjs. History keeps the last 50 runs.</footer>
</main>
</body>
</html>
`;

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'index.html'), html);
writeFileSync(join(outDir, 'history.json'), JSON.stringify(history, null, 2));
console.log(`Test dashboard: ${totals.total} test runs, ${totals.failed} failed, ${totals.flaky} flaky -> ${join(outDir, 'index.html')}`);
