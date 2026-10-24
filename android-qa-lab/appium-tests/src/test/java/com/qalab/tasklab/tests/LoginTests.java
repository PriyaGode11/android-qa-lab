package com.qalab.tasklab.tests;

import com.qalab.tasklab.base.BaseTest;
import com.qalab.tasklab.pages.LoginPage;
import com.qalab.tasklab.pages.TaskListPage;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;
import org.testng.asserts.SoftAssert;

import static com.qalab.tasklab.config.TestConfig.VALID_PASSWORD;
import static com.qalab.tasklab.config.TestConfig.VALID_USERNAME;
import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertTrue;

public class LoginTests extends BaseTest {

    private static final String USERNAME_REQUIRED = "Username is required";
    private static final String PASSWORD_REQUIRED = "Password is required";
    private static final String INVALID = "Invalid username or password";
    private static final String LOCKED = "Account locked after 3 failed attempts";

    @Test(groups = {"smoke", "regression"},
          description = "LOGIN-01: Valid credentials open the task list with a personalised greeting")
    public void validLoginOpensTaskList() {
        TaskListPage tasks = loginAsValidUser();

        assertEquals(tasks.welcomeText(), "Welcome, qa_user");
        assertEquals(tasks.summary(), "No tasks yet");
    }

    @Test(groups = "regression",
          description = "LOGIN-02: Leading and trailing spaces in the username are ignored")
    public void usernameIsTrimmed() {
        TaskListPage tasks = loginScreen().loginAs("  " + VALID_USERNAME + "  ", VALID_PASSWORD);

        assertEquals(tasks.welcomeText(), "Welcome, qa_user");
    }

    @DataProvider(name = "invalidCredentials")
    public Object[][] invalidCredentials() {
        return new Object[][]{
                // username,          password,             expected error
                {"",                  VALID_PASSWORD,       USERNAME_REQUIRED},
                {"   ",               VALID_PASSWORD,       USERNAME_REQUIRED},
                {VALID_USERNAME,      "",                   PASSWORD_REQUIRED},
                {"",                  "",                   USERNAME_REQUIRED},
                {"unknown_user",      VALID_PASSWORD,       INVALID},
                {VALID_USERNAME,      "wrong",              INVALID},
                {"QA_USER",           VALID_PASSWORD,       INVALID},  // username is case-sensitive
                {VALID_USERNAME,      "passw0rd!",          INVALID},  // password is case-sensitive
                {VALID_USERNAME,      VALID_PASSWORD + " ", INVALID},  // password is never trimmed
        };
    }

    @Test(groups = {"smoke", "regression"}, dataProvider = "invalidCredentials",
          description = "LOGIN-03: Invalid or missing credentials show the right error and stay on login")
    public void invalidCredentialsShowError(String username, String password, String expectedError) {
        LoginPage login = loginScreen().attemptLogin(username, password);

        assertEquals(login.errorMessage(), expectedError);
        assertTrue(login.isDisplayed(), "User should remain on the login screen");
    }

    @Test(groups = "regression",
          description = "LOGIN-04: Password is masked and cleared after a failed attempt")
    public void passwordIsMaskedAndClearedAfterFailure() {
        LoginPage login = loginScreen();
        assertTrue(login.isPasswordMasked(), "Password field should mask input");

        login.attemptLogin(VALID_USERNAME, "wrong");
        assertTrue(login.isPasswordEmpty(), "Password should be cleared after a failed login");
    }

    @Test(groups = {"smoke", "regression"},
          description = "LOGIN-05: Account locks after three failed attempts, even for correct credentials")
    public void accountLocksAfterThreeFailures() {
        LoginPage login = loginScreen();
        SoftAssert soft = new SoftAssert();

        soft.assertEquals(login.attemptLogin(VALID_USERNAME, "bad-1").errorMessage(), INVALID, "attempt 1");
        soft.assertEquals(login.attemptLogin(VALID_USERNAME, "bad-2").errorMessage(), INVALID, "attempt 2");
        soft.assertEquals(login.attemptLogin(VALID_USERNAME, "bad-3").errorMessage(), LOCKED, "attempt 3");
        soft.assertEquals(login.attemptLogin(VALID_USERNAME, VALID_PASSWORD).errorMessage(), LOCKED,
                "correct password after lockout");
        soft.assertAll();
    }

    @Test(groups = "regression",
          description = "LOGIN-06: Validation errors (blank fields) do not count toward the lockout")
    public void validationErrorsDoNotCountTowardLockout() {
        LoginPage login = loginScreen();
        login.attemptLogin("", "x");
        login.attemptLogin(VALID_USERNAME, "");
        login.attemptLogin("", "");
        login.attemptLogin(VALID_USERNAME, "bad-1");

        assertEquals(login.errorMessage(), INVALID, "Only one real failure so far; must not be locked");
        assertTrue(login.loginAs(VALID_USERNAME, VALID_PASSWORD).isDisplayed());
    }

    @Test(groups = "regression",
          description = "LOGIN-07: A successful login resets the failed-attempt counter")
    public void successfulLoginResetsFailedAttempts() {
        LoginPage login = loginScreen();
        login.attemptLogin(VALID_USERNAME, "bad-1");
        login.attemptLogin(VALID_USERNAME, "bad-2");
        login = login.loginAs(VALID_USERNAME, VALID_PASSWORD).logout();

        // Two more failures would lock the account if the counter had not been reset.
        login.attemptLogin(VALID_USERNAME, "bad-3");
        login.attemptLogin(VALID_USERNAME, "bad-4");
        assertEquals(login.errorMessage(), INVALID);
        assertFalse(login.loginAs(VALID_USERNAME, VALID_PASSWORD).welcomeText().isEmpty());
    }
}
