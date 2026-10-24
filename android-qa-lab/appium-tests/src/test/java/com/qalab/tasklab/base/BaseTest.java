package com.qalab.tasklab.base;

import com.qalab.tasklab.config.TestConfig;
import com.qalab.tasklab.driver.DriverFactory;
import com.qalab.tasklab.driver.DriverManager;
import com.qalab.tasklab.pages.LoginPage;
import com.qalab.tasklab.pages.TaskListPage;
import io.appium.java_client.AppiumBy;
import io.appium.java_client.android.AndroidDriver;
import org.openqa.selenium.By;
import org.openqa.selenium.ScreenOrientation;
import org.openqa.selenium.TimeoutException;
import org.openqa.selenium.WebDriverException;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.testng.annotations.AfterClass;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.BeforeMethod;

import java.time.Duration;
import java.util.Map;

/**
 * One Appium session per test class (fast), with app data wiped before every
 * test method (isolated). No test depends on another test's state.
 */
public abstract class BaseTest {

    /** Cold starts on CI emulators can take a while, especially behind the splash screen. */
    private static final Duration LAUNCH_ATTEMPT_TIMEOUT = Duration.ofSeconds(30);
    private static final int MAX_LAUNCH_ATTEMPTS = 3;

    private static final By LOGIN_SCREEN = AppiumBy.id(TestConfig.APP_PACKAGE + ":id/login_title");
    private static final By TASK_SCREEN = AppiumBy.id(TestConfig.APP_PACKAGE + ":id/welcome_text");

    @BeforeClass(alwaysRun = true)
    public void startSession() {
        DriverManager.set(DriverFactory.create());
    }

    @BeforeMethod(alwaysRun = true)
    public void resetAppToFreshInstallState() {
        AndroidDriver driver = driver();
        if (driver.getOrientation() != ScreenOrientation.PORTRAIT) {
            driver.rotate(ScreenOrientation.PORTRAIT);
        }
        // Equivalent to `adb shell pm clear`: wipes the session, lockout counter and tasks.
        driver.executeScript("mobile: clearApp", Map.of("appId", TestConfig.APP_PACKAGE));
        driver.activateApp(TestConfig.APP_PACKAGE);
        waitForAppLaunched();
    }

    @AfterClass(alwaysRun = true)
    public void endSession() {
        DriverManager.quit();
    }

    protected AndroidDriver driver() {
        return DriverManager.get();
    }

    protected LoginPage loginScreen() {
        return new LoginPage(driver()).waitUntilLoaded();
    }

    protected TaskListPage loginAsValidUser() {
        return loginScreen().loginAs(TestConfig.VALID_USERNAME, TestConfig.VALID_PASSWORD);
    }

    /** Kills the app process and starts it again, like a user swiping it away. */
    protected void restartApp() {
        driver().terminateApp(TestConfig.APP_PACKAGE);
        driver().activateApp(TestConfig.APP_PACKAGE);
        waitForAppLaunched();
    }

    /**
     * Waits until the app has drawn its first real screen (login or task list).
     * While the splash screen is up, UiAutomator2 may fail to read the window at
     * all and throw a server-side error, so those errors are retried. If a busy
     * emulator stalls a launch, the app is relaunched (up to three attempts).
     */
    protected void waitForAppLaunched() {
        for (int attempt = 1; ; attempt++) {
            try {
                new WebDriverWait(driver(), LAUNCH_ATTEMPT_TIMEOUT)
                        .pollingEvery(Duration.ofSeconds(1))
                        .ignoring(WebDriverException.class)
                        .withMessage("TaskLab did not finish launching (attempt " + attempt + ")")
                        .until(d -> !d.findElements(LOGIN_SCREEN).isEmpty()
                                || !d.findElements(TASK_SCREEN).isEmpty());
                return;
            } catch (TimeoutException e) {
                if (attempt >= MAX_LAUNCH_ATTEMPTS) {
                    throw e;
                }
                System.out.println("  TaskLab not ready after attempt " + attempt + "; relaunching");
                try {
                    driver().terminateApp(TestConfig.APP_PACKAGE);
                } catch (WebDriverException ignored) {
                    // The process may already be gone.
                }
                driver().activateApp(TestConfig.APP_PACKAGE);
            }
        }
    }
}
