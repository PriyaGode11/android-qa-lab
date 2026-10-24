# TaskLab Regression Test Plan

## 1. Scope

**In scope:** authentication and lockout, task create/update/delete, input validation, data persistence, session handling, and Android lifecycle behaviour (restart, rotation, background, back stack) of TaskLab 1.0.0.

**Out of scope:** performance, security penetration testing, accessibility audits beyond locator-level checks, and devices other than the emulator matrix below.

## 2. Approach

| Layer | Tool | What it proves | When it runs |
|---|---|---|---|
| Unit | JUnit 4 on the JVM | Every business rule and boundary in `AuthService` and `TaskList` | Every push and PR |
| UI smoke | Appium + TestNG (`smoke` group) | The critical user journey works on a real Android runtime | Every PR |
| UI regression | Appium + TestNG (`regression` group) | Every requirement below, end to end | `main`, nightly, on demand |

**Device matrix:** Android 10 (API 29) and Android 14 (API 34) emulators, Pixel 6 profile.

**Test data:** each test creates its own data after the app is reset to a fresh-install state, so tests are independent and order-agnostic.

**Entry criteria:** APK builds and unit tests pass.
**Exit criteria:** 100% of smoke tests pass for a PR to merge; any regression failure on `main` is triaged within one working day (product bug, test bug, or environment issue) using the attached screenshot, UI dump and logcat.

## 3. Requirements and traceability

| Req | Requirement | Unit tests | UI tests |
|---|---|---|---|
| R1 | Valid credentials open the task list with a greeting | `validCredentialsSucceed` | LOGIN-01 |
| R2 | Username is trimmed; credentials are case-sensitive; password is never trimmed | `usernameIsTrimmed`, `usernameIsCaseSensitive` | LOGIN-02, LOGIN-03 |
| R3 | Missing username or password shows a specific message | `blankUsernameIsRejected…`, `emptyPasswordIsRejected` | LOGIN-03 |
| R4 | Password is masked and cleared after a failure | — | LOGIN-04 |
| R5 | Account locks after 3 failed attempts, even for correct credentials; blank-field errors don't count | `locksAfterThreeFailures` | LOGIN-05, LOGIN-06 |
| R6 | Successful login resets the failure counter | `successResetsFailedAttempts` | LOGIN-07 |
| R7 | Lockout persists across restarts | `restoredLockStateIsHonoured` | SESS-06 |
| R8 | New users see an empty state; summary reads "No tasks yet" | `emptyListSummary` | TASK-01 |
| R9 | Added tasks appear in insertion order; summary is pluralized correctly | `addTaskUpdatesSummaryWithSingularNoun` | TASK-02, TASK-03 |
| R10 | Blank titles are rejected | `blankTitlesAreRejected` | TASK-04 |
| R11 | Titles are limited to 40 characters (40 accepted, 41 rejected) | `titleLengthBoundary` | TASK-04, TASK-05 |
| R12 | Duplicates are rejected ignoring case and spacing | `duplicatesAreRejectedIgnoringCase` | TASK-06 |
| R13 | Whitespace is trimmed and collapsed; Unicode and symbols are preserved | `whitespaceIsNormalized` | TASK-07, TASK-08 |
| R14 | Errors clear after a successful add | — | TASK-09 |
| R15 | Tasks can be completed and un-completed; summary and "Clear completed" state follow | `toggleAndClearCompleted` | TASK-10 |
| R16 | Delete requires confirmation; cancel keeps the task; deleting the last task restores the empty state | `deleteRemovesOnlyTheTargetTask` | TASK-11, TASK-12, TASK-13 |
| R17 | "Clear completed" removes only completed tasks | `toggleAndClearCompleted` | TASK-14 |
| R18 | Long lists remain fully reachable by scrolling | — | TASK-15 |
| R19 | Tasks and completion state persist across restarts and logout/login | `idsStayUniqueAfterReload` | SESS-01, SESS-05 |
| R20 | Sessions persist across restarts until logout | — | SESS-02, SESS-03 |
| R21 | After logout, Back never reveals the task list | — | SESS-04 |
| R22 | Rotation keeps tasks and half-typed input | — | SESS-07 |
| R23 | Background and resume keeps state | — | SESS-08 |

## 4. UI test catalogue

`S` = in the smoke suite. Every test is also in the regression suite.

| ID | Test method | S |
|---|---|---|
| LOGIN-01 | `LoginTests.validLoginOpensTaskList` | S |
| LOGIN-02 | `LoginTests.usernameIsTrimmed` | |
| LOGIN-03 | `LoginTests.invalidCredentialsShowError` (9 data rows) | S |
| LOGIN-04 | `LoginTests.passwordIsMaskedAndClearedAfterFailure` | |
| LOGIN-05 | `LoginTests.accountLocksAfterThreeFailures` | S |
| LOGIN-06 | `LoginTests.validationErrorsDoNotCountTowardLockout` | |
| LOGIN-07 | `LoginTests.successfulLoginResetsFailedAttempts` | |
| TASK-01 | `TaskManagementTests.newUserSeesEmptyState` | |
| TASK-02 | `TaskManagementTests.addTaskAppearsInList` | S |
| TASK-03 | `TaskManagementTests.tasksKeepInsertionOrder` | |
| TASK-04 | `TaskManagementTests.invalidTitlesAreRejected` (3 data rows) | S |
| TASK-05 | `TaskManagementTests.fortyCharacterTitleIsAccepted` | |
| TASK-06 | `TaskManagementTests.duplicatesAreRejectedIgnoringCaseAndSpacing` | |
| TASK-07 | `TaskManagementTests.whitespaceIsNormalized` | |
| TASK-08 | `TaskManagementTests.specialCharactersAreSupported` | |
| TASK-09 | `TaskManagementTests.errorClearsAfterSuccessfulAdd` | |
| TASK-10 | `TaskManagementTests.toggleTaskUpdatesSummary` | S |
| TASK-11 | `TaskManagementTests.deleteWithConfirmation` | S |
| TASK-12 | `TaskManagementTests.cancelDeleteKeepsTask` | |
| TASK-13 | `TaskManagementTests.deletingLastTaskShowsEmptyState` | |
| TASK-14 | `TaskManagementTests.clearCompletedRemovesOnlyDoneTasks` | |
| TASK-15 | `TaskManagementTests.longListIsScrollable` | |
| SESS-01 | `SessionAndLifecycleTests.tasksPersistAfterRestart` | S |
| SESS-02 | `SessionAndLifecycleTests.sessionSurvivesRestart` | |
| SESS-03 | `SessionAndLifecycleTests.logoutEndsSession` | S |
| SESS-04 | `SessionAndLifecycleTests.backAfterLogoutDoesNotReturnToTasks` | |
| SESS-05 | `SessionAndLifecycleTests.tasksSurviveLogoutAndLogin` | |
| SESS-06 | `SessionAndLifecycleTests.lockoutSurvivesRestart` | |
| SESS-07 | `SessionAndLifecycleTests.rotationKeepsState` | |
| SESS-08 | `SessionAndLifecycleTests.backgroundAndResumeKeepsState` | |

Totals: 30 UI test methods (40 executions including data rows; 9 methods / 19 executions in smoke) and 17 unit tests.

## 5. Flakiness controls

- Animations disabled on the emulator and in the Appium session.
- No implicit waits; every step waits on an observable condition.
- Resource-ID and accessibility-ID locators only.
- App data cleared before each test; no shared state between tests.
- Failures capture a screenshot, the UI hierarchy, logcat and the Appium log, so a failure can be classified without a rerun.
