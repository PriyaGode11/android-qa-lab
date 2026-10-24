package com.qalab.tasklab.base;

import com.qalab.tasklab.config.TestConfig;
import com.qalab.tasklab.driver.DriverFactory;
import com.qalab.tasklab.driver.DriverManager;
import com.qalab.tasklab.pages.LoginPage;
import com.qalab.tasklab.pages.TaskListPage;
import io.appium.java_client.android.AndroidDriver;
import org.openqa.selenium.ScreenOrientation;
import org.testng.annotations.AfterClass;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.BeforeMethod;

import java.util.Map;

/**
 * One Appium session per test class (fast), with app data wiped before every
 * test method (isolated). No test depends on another test's state.
 */
public abstract class BaseTest {

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
    }
}
