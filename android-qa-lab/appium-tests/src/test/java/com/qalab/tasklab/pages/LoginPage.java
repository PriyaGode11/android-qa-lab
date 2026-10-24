package com.qalab.tasklab.pages;

import io.appium.java_client.android.AndroidDriver;
import org.openqa.selenium.By;

public class LoginPage extends BasePage {

    private static final By TITLE = id("login_title");
    private static final By USERNAME = id("username_input");
    private static final By PASSWORD = id("password_input");
    private static final By LOGIN_BUTTON = id("login_button");
    private static final By ERROR = id("login_error");
    private static final String PASSWORD_HINT = "Password";

    public LoginPage(AndroidDriver driver) {
        super(driver);
    }

    public LoginPage waitUntilLoaded() {
        waitVisible(TITLE);
        return this;
    }

    public boolean isDisplayed() {
        return isPresent(TITLE) && isPresent(LOGIN_BUTTON);
    }

    /** Submits credentials expecting success. */
    public TaskListPage loginAs(String username, String password) {
        submit(username, password);
        return new TaskListPage(driver).waitUntilLoaded();
    }

    /** Submits credentials expecting to stay on this screen. */
    public LoginPage attemptLogin(String username, String password) {
        submit(username, password);
        waitVisible(ERROR);
        return this;
    }

    public String errorMessage() {
        return textOf(ERROR);
    }

    public boolean isErrorShown() {
        return isPresent(ERROR);
    }

    /** An empty EditText reports its hint ("Password") as text on most API levels. */
    public boolean isPasswordEmpty() {
        String text = driver.findElement(PASSWORD).getText();
        return text == null || text.isEmpty() || text.equals(PASSWORD_HINT);
    }

    public boolean isPasswordMasked() {
        return Boolean.parseBoolean(driver.findElement(PASSWORD).getAttribute("password"));
    }

    private void submit(String username, String password) {
        type(USERNAME, username);
        type(PASSWORD, password);
        hideKeyboard();
        tap(LOGIN_BUTTON);
    }
}
