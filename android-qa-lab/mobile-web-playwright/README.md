# TaskLab Mobile Web: Regression Testing with Playwright

The web version of TaskLab (the same app as the native Android lab), with a Playwright regression suite that runs on an **emulated Android phone (Pixel 7, Chromium)**, an **emulated iPhone 14 (WebKit, Safari's engine)** and **desktop Chrome**.

- **`app/`**: the mobile web app (plain HTML, CSS and JavaScript, no build step)
- **`tests/`**: the Playwright suite in TypeScript (Page Object Model + fixtures)
- **`playwright.config.ts`**: devices, reporters, screenshots, videos and traces
- **`server.js`**: a tiny zero-dependency web server Playwright starts automatically
- **`.github/workflows/mobile-web.yml`** (repo root): runs everything on every change

## Results

| Device | Tests run | Notes |
|---|---|---|
| Android - Pixel 7 (Chromium) | 50 | includes touch and rotation tests |
| iPhone 14 (WebKit) | 50 | includes touch and rotation tests |
| Desktop Chrome | 48 + 2 skipped | touch and rotation don't apply to desktop |

148 test runs per pipeline. Checked locally with every test repeated three times in parallel (444 of 444 passed, none flaky).

### A real bug the suite caught

On its first run, `SESS-04` failed on every device. After logging out, the previous user's tasks were only **hidden** with CSS, not removed, so they were still in the page and readable through the browser's developer tools or a screen reader. The app now clears the data on logout, and the test guards against it coming back.

## What is tested

| Area | Tests | Examples |
|---|---|---|
| Authentication | AUTH-01 to 08 (16 runs) | valid login; 9 data-driven invalid cases; trimming; case sensitivity; masked password; 3-strike lockout; counter reset; keyboard "Go" key |
| Task management | TASK-01 to 16 (18 runs) | add, order, toggle, delete with confirm/cancel, clear completed; empty, whitespace and 40/41-character boundaries; duplicates; HTML shown as text, not run |
| Session & persistence | SESS-01 to 08 | survives reload; new tab; logout; Back after logout; direct URL while logged out; lockout survives reload; logout syncs across tabs |
| Mobile experience | MOB-01 to 08 | mobile viewport; no sideways scrolling; 44×44 px touch targets; 16 px inputs (no iPhone zoom); tap gestures; rotation; keyboard and password-manager hints; dialog fits on screen |

`@smoke` tests (21 per phone) are the critical path: run them with `npm run test:smoke`.

### Full catalogue

| ID | Test | Smoke |
|---|---|---|
| AUTH-01 | Valid credentials open the task list | ✓ |
| AUTH-02 | Spaces around the username are ignored | |
| AUTH-03 | Rejects 9 invalid credential combinations with the right message | ✓ |
| AUTH-04 | Password is masked and cleared after a failure | |
| AUTH-05 | Account locks after 3 failures, even for the correct password | ✓ |
| AUTH-06 | Blank-field errors don't count toward the lockout | |
| AUTH-07 | A successful login resets the failure counter | |
| AUTH-08 | Enter / "Go" on the keyboard submits | |
| TASK-01 | Empty state and disabled "Clear completed" | |
| TASK-02 | Adding a task shows it and updates the summary | ✓ |
| TASK-03 | Tasks keep the order they were added | |
| TASK-04 | Rejects empty, whitespace-only and 41-character titles | ✓ |
| TASK-05 | Exactly 40 characters is accepted | |
| TASK-06 | Duplicates rejected regardless of case and spacing | |
| TASK-07 | Whitespace is trimmed and collapsed | |
| TASK-08 | Accents and symbols kept; HTML displayed as text | |
| TASK-09 | Error clears after a successful add | |
| TASK-10 | Complete / un-complete updates summary and button state | ✓ |
| TASK-11 | Delete asks for confirmation, removes only that task | ✓ |
| TASK-12 | Cancelling the dialog keeps the task | |
| TASK-13 | Deleting the last task shows the empty state | |
| TASK-14 | "Clear completed" removes only completed tasks | |
| TASK-15 | Long lists scroll; first and last tasks reachable | |
| TASK-16 | Enter / "Done" on the keyboard adds a task | |
| SESS-01 | Tasks and done-state survive a reload | ✓ |
| SESS-02 | Logged-in user lands on tasks in a new tab | |
| SESS-03 | Logout ends the session, including after reload | ✓ |
| SESS-04 | Back after logout shows login and leaves no data in the page | |
| SESS-05 | Opening `#/tasks` while logged out redirects to login | |
| SESS-06 | Tasks survive logout and login | |
| SESS-07 | Lockout survives a reload | |
| SESS-08 | Logging out in one tab logs out the other | |
| MOB-01 | Page declares a mobile viewport | ✓ |
| MOB-02 | No sideways scrolling, even with long unbroken text | |
| MOB-03 | Buttons and task rows are at least 44×44 px | |
| MOB-04 | Inputs use 16 px text so iPhone Safari doesn't zoom | |
| MOB-05 | Tapping works for add, toggle and delete | ✓ |
| MOB-06 | Rotating to landscape keeps tasks and typed input | |
| MOB-07 | Keyboard and password-manager hints on the login form | |
| MOB-08 | Delete dialog fits on screen | |

## Design decisions

- **Isolation for free:** every test gets a brand-new browser context, so storage (session, lockout, tasks) always starts empty. Tests run in parallel and in any order.
- **User-facing locators:** tests find elements the way users do (`getByRole`, `getByLabel`), never by CSS classes or XPath. As a bonus, a missing accessible label breaks a test.
- **No sleeps:** Playwright's web-first assertions retry until the page is right or the timeout hits.
- **Real engines:** iPhone tests run on WebKit, the engine inside Safari, not on Chrome with a small window.
- **Evidence on failure:** screenshot, video and a step-by-step trace for every failed test.
- **Retry policy:** one retry on CI; anything that only passes on retry is reported as *flaky*, not hidden.

## Run it on your computer

Needs [Node.js](https://nodejs.org) 18 or newer.

```bash
cd mobile-web-playwright
npm install
npx playwright install chromium webkit

npm test                  # everything, all devices
npm run test:android      # Pixel 7 only
npm run test:iphone       # iPhone 14 only
npm run test:smoke        # critical path only
npm run test:headed       # watch the browser click through the tests
npm run test:ui           # Playwright's interactive UI: pick tests, step through them
npm run report            # open the HTML report from the last run
```

To use the app yourself: `npm start`, then open http://localhost:4173 (log in with **qa_user / Passw0rd!**). On a Mac, Chrome's DevTools device toolbar (Cmd + Shift + M) shows it at phone size.

## CI

`.github/workflows/mobile-web.yml` runs whenever this folder changes, nightly, and on demand. Each run shows a per-device results table on its summary page and uploads:

- **playwright-report**: the HTML report (download, unzip, open `index.html`)
- **test-results**: screenshots, videos and traces for failures

Start it manually from **Actions → Mobile web regression → Run workflow** and tick **Record a video of every test** to get a video of each test for demos.
