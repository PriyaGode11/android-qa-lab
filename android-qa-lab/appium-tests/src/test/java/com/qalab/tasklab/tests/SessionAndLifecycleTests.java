package com.qalab.tasklab.tests;

import com.qalab.tasklab.base.BaseTest;
import com.qalab.tasklab.config.TestConfig;
import com.qalab.tasklab.pages.LoginPage;
import com.qalab.tasklab.pages.TaskListPage;
import org.openqa.selenium.ScreenOrientation;
import org.testng.annotations.Test;
import org.testng.asserts.SoftAssert;

import java.time.Duration;
import java.util.List;

import static com.qalab.tasklab.config.TestConfig.VALID_PASSWORD;
import static com.qalab.tasklab.config.TestConfig.VALID_USERNAME;
import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertTrue;

/** Regression coverage for things users do to the app, not just in it. */
public class SessionAndLifecycleTests extends BaseTest {

    @Test(groups = {"smoke", "regression"},
          description = "SESS-01: Tasks and their completion state survive an app restart")
    public void tasksPersistAfterRestart() {
        loginAsValidUser().addTasks("Persisted", "Also persisted").toggleTask("Persisted");

        restartApp();
        TaskListPage tasks = new TaskListPage(driver()).waitUntilLoaded();

        SoftAssert soft = new SoftAssert();
        soft.assertEquals(tasks.visibleTaskTitles(), List.of("Persisted", "Also persisted"));
        soft.assertTrue(tasks.isTaskDone("Persisted"), "completion state restored");
        soft.assertFalse(tasks.isTaskDone("Also persisted"));
        soft.assertEquals(tasks.summary(), "2 tasks, 1 done");
        soft.assertAll();
    }

    @Test(groups = "regression",
          description = "SESS-02: A logged-in user goes straight to the task list on relaunch")
    public void sessionSurvivesRestart() {
        loginAsValidUser();

        restartApp();

        TaskListPage tasks = new TaskListPage(driver()).waitUntilLoaded();
        assertEquals(tasks.welcomeText(), "Welcome, qa_user");
    }

    @Test(groups = {"smoke", "regression"},
          description = "SESS-03: Logging out ends the session, including after a restart")
    public void logoutEndsSession() {
        LoginPage login = loginAsValidUser().logout();
        assertTrue(login.isDisplayed());

        restartApp();

        assertTrue(new LoginPage(driver()).waitUntilLoaded().isDisplayed(),
                "Login screen should be shown after restart");
    }

    @Test(groups = "regression",
          description = "SESS-04: Back from the login screen after logout never reveals the task list")
    public void backAfterLogoutDoesNotReturnToTasks() {
        loginAsValidUser().logout();

        driver().navigate().back();
        driver().activateApp(TestConfig.APP_PACKAGE);

        LoginPage login = new LoginPage(driver()).waitUntilLoaded();
        assertTrue(login.isDisplayed());
        assertFalse(new TaskListPage(driver()).isDisplayed());
    }

    @Test(groups = "regression",
          description = "SESS-05: Tasks logged out and back in are still there")
    public void tasksSurviveLogoutAndLogin() {
        loginAsValidUser().addTasks("Still here").logout();

        TaskListPage tasks = loginScreen().loginAs(VALID_USERNAME, VALID_PASSWORD);

        assertTrue(tasks.hasTask("Still here"));
    }

    @Test(groups = "regression",
          description = "SESS-06: Account lockout persists across an app restart")
    public void lockoutSurvivesRestart() {
        LoginPage login = loginScreen();
        login.attemptLogin(VALID_USERNAME, "bad-1");
        login.attemptLogin(VALID_USERNAME, "bad-2");
        login.attemptLogin(VALID_USERNAME, "bad-3");

        restartApp();

        login = new LoginPage(driver()).waitUntilLoaded()
                .attemptLogin(VALID_USERNAME, VALID_PASSWORD);
        assertEquals(login.errorMessage(), "Account locked after 3 failed attempts");
    }

    @Test(groups = "regression",
          description = "SESS-07: Rotating the device keeps tasks and half-typed input")
    public void rotationKeepsState() {
        TaskListPage tasks = loginAsValidUser().addTasks("Rotate me");
        tasks.typeIntoTaskInput("Half typed");

        driver().rotate(ScreenOrientation.LANDSCAPE);
        tasks = new TaskListPage(driver()).waitUntilLoaded();

        SoftAssert soft = new SoftAssert();
        soft.assertTrue(tasks.hasTask("Rotate me"), "task kept in landscape");
        soft.assertEquals(tasks.taskInputText(), "Half typed", "input kept in landscape");
        soft.assertEquals(tasks.summary(), "1 task, 0 done");

        driver().rotate(ScreenOrientation.PORTRAIT);
        tasks = new TaskListPage(driver()).waitUntilLoaded();
        soft.assertTrue(tasks.hasTask("Rotate me"), "task kept back in portrait");
        soft.assertAll();
    }

    @Test(groups = "regression",
          description = "SESS-08: Sending the app to the background and back keeps state")
    public void backgroundAndResumeKeepsState() {
        loginAsValidUser().addTasks("Background me");

        driver().runAppInBackground(Duration.ofSeconds(3));

        TaskListPage tasks = new TaskListPage(driver()).waitUntilLoaded();
        assertTrue(tasks.hasTask("Background me"));
        assertEquals(tasks.summary(), "1 task, 0 done");
    }
}
