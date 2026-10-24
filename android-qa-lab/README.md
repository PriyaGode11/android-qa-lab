# TaskLab: Android Regression Testing Lab (Appium + Java)

A self-contained lab showing end-to-end regression testing of a **native Android app**:

- **`android-app/`**: TaskLab, a small native Kotlin app (login with lockout, task list with validation, delete confirmation, persistence) plus JVM unit tests for its business rules.
- **`appium-tests/`**: an Appium 2 + UiAutomator2 regression suite in **Java 17 / TestNG**, built on the Page Object Model, with 40 test executions covering functional, boundary, negative and lifecycle scenarios.
- **`.github/workflows/`**: a CI pipeline that builds the APK, runs unit tests, boots Android emulators on **API 29 and API 34**, and runs the suite on both, publishing screenshots, UI dumps, logcat and Appium logs for every failure.
- **`docs/TEST_PLAN.md`**: scope, approach, and a requirement-to-test traceability matrix.

## Why Appium and not Playwright?

Playwright automates browsers. It cannot drive native Android views (EditText, RecyclerView, AlertDialog). Its experimental Android support only reaches Chrome and WebView content. Appium talks to the device through Google's UiAutomator2 framework, so it can test any native screen, system dialog, rotation, backgrounding and app restarts. For web apps, Playwright would be the better choice; the page-object and data-driven patterns used here carry over directly.

## Test pyramid

```
                 ┌─────────────────────────────┐
                 │  Appium UI regression       │  30 test methods / 40 executions
                 │  (real app on emulator)     │  smoke subset on every PR
                 ├─────────────────────────────┤
                 │  JVM unit tests             │  17 tests, run in seconds
                 │  (AuthService, TaskList)    │  every validation rule & boundary
                 └─────────────────────────────┘
```

Business rules are tested cheaply at the unit level; the UI suite verifies the same rules are wired correctly through the real screens, plus everything only a device can show (persistence, rotation, back stack, backgrounding).

## What the regression suite covers

| Area | Examples |
|---|---|
| Authentication | valid login, 9 data-driven invalid combinations, trimming, case sensitivity, masked password, lockout after 3 failures, lockout survives restart, counter reset after success |
| Task CRUD | add, insertion order, toggle done/undone, delete with confirm/cancel, clear completed |
| Validation | blank, whitespace-only, 40/41-character boundary, case- and space-insensitive duplicates, error clears after success |
| Data | whitespace normalization, accented characters and symbols |
| Lifecycle | restart persistence, session persistence, logout + restart, back stack after logout, rotation (keeps half-typed input), background/resume |
| UI | empty state, summary pluralization, button enabled/disabled states, long-list scrolling |

Full list with IDs: [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md).

## Suite design

```
appium-tests/src/test/java/com/qalab/tasklab/
├── config/TestConfig.java        settings: system prop → env var → config.properties → default
├── driver/DriverFactory.java     UiAutomator2Options, one place to change capabilities
├── driver/DriverManager.java     ThreadLocal driver (ready for parallel devices)
├── base/BaseTest.java            session per class; app data wiped before every test
├── pages/                        Page Objects: LoginPage, TaskListPage, DeleteDialog
├── listeners/                    screenshot + UI hierarchy saved on every failure
└── tests/                        LoginTests, TaskManagementTests, SessionAndLifecycleTests
```

Key decisions:

- **Test isolation without slow reinstalls.** One Appium session per class, and `mobile: clearApp` (equivalent to `adb shell pm clear`) before every test. Every test starts from a fresh-install state and can run alone or in any order.
- **Explicit waits only.** Implicit wait is set to zero; every page method waits for a concrete condition (summary text changed, checkbox state flipped, dialog gone). This is the main defence against flaky mobile tests.
- **Stable locators.** Resource IDs and accessibility IDs (`Delete <task title>`), never coordinates or index-based XPath.
- **Data-driven negatives.** TestNG `@DataProvider` keeps edge cases in one readable table.
- **Soft assertions** where one scenario has several independent checks, so a single run reports every broken expectation.
- **Smoke vs regression groups.** PRs run the smoke subset; `main`, nightly and manual runs execute the full regression.

## Run it locally

### Prerequisites

| Tool | Version | Check |
|---|---|---|
| JDK | 17 | `java -version` |
| Android Studio (SDK + emulator) | recent | an AVD such as Pixel 6, API 34 |
| Node.js | 18+ | `node -v` |
| Appium | 2.x | `npm install -g appium@2` |
| UiAutomator2 driver | latest | `appium driver install uiautomator2` |
| Maven | 3.9+ | `mvn -v` |

Make sure `ANDROID_HOME` points to your SDK (on macOS usually `~/Library/Android/sdk`, on Windows `%LOCALAPPDATA%\Android\Sdk`), and that `adb devices` lists your emulator. `appium driver doctor uiautomator2` will flag anything missing.

### Steps

```bash
# 1. Build the app and run its unit tests
cd android-app
./gradlew testDebugUnitTest assembleDebug          # Windows: gradlew.bat ...

# 2. Start an emulator (from Android Studio's Device Manager, or):
emulator -avd Pixel_6_API_34

# 3. Start Appium in a separate terminal
appium

# 4. Run the suite
cd ../appium-tests
mvn test                                           # full regression
mvn test -Dsuite=testng-smoke.xml                  # smoke only
mvn test -Dtest=LoginTests                         # one class
```

Optional overrides: `-Dappium.url=...`, `-Dapp.path=...`, `-Ddevice.udid=emulator-5554`, `-Dplatform.version=14`.

### Results

- TestNG HTML report: `appium-tests/target/surefire-reports/index.html`
- Failure screenshots and UI hierarchy XML: `appium-tests/target/artifacts/`

You can also open `android-app/` in Android Studio and run TaskLab manually. The demo account is **qa_user / Passw0rd!**.

## CI

Push the repo to GitHub and the workflow in `.github/workflows/android-regression.yml` runs automatically:

1. **Build**: unit tests and debug APK.
2. **UI regression** on an API 29 and an API 34 emulator in parallel (Appium 2 + UiAutomator2, animations off).
3. **Reports**: a pass/fail table on the run's summary page, plus downloadable artifacts with the TestNG report, failure screenshots, UI dumps, logcat and the Appium server log.
