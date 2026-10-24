package com.qalab.tasklab.pages;

import com.qalab.tasklab.config.TestConfig;
import io.appium.java_client.AppiumBy;
import io.appium.java_client.android.AndroidDriver;
import org.openqa.selenium.By;
import org.openqa.selenium.WebElement;

import java.util.List;
import java.util.stream.Collectors;

public class TaskListPage extends BasePage {

    private static final By WELCOME = id("welcome_text");
    private static final By LOGOUT = id("logout_button");
    private static final By TASK_INPUT = id("task_input");
    private static final By ADD_BUTTON = id("add_button");
    private static final By ERROR = id("task_error");
    private static final By SUMMARY = id("summary_text");
    private static final By EMPTY_STATE = id("empty_state");
    private static final By TASK_ROWS = id("task_checkbox");
    private static final By CLEAR_COMPLETED = id("clear_completed_button");
    private static final String TASK_INPUT_HINT = "New task";

    public TaskListPage(AndroidDriver driver) {
        super(driver);
    }

    public TaskListPage waitUntilLoaded() {
        waitVisible(WELCOME);
        waitVisible(SUMMARY);
        return this;
    }

    public boolean isDisplayed() {
        return isPresent(WELCOME) && isPresent(TASK_INPUT);
    }

    public String welcomeText() {
        return textOf(WELCOME);
    }

    // ---- adding tasks -------------------------------------------------------

    /** Adds a task that is expected to be accepted; waits for the summary to change. */
    public TaskListPage addTask(String title) {
        String before = summary();
        type(TASK_INPUT, title);
        tap(ADD_BUTTON);
        wait.until(d -> !summary().equals(before));
        return this;
    }

    public TaskListPage addTasks(String... titles) {
        for (String title : titles) {
            addTask(title);
        }
        hideKeyboard();
        return this;
    }

    /** Submits a task that is expected to be rejected; waits for the error. */
    public TaskListPage tryAddTask(String title) {
        type(TASK_INPUT, title);
        tap(ADD_BUTTON);
        waitVisible(ERROR);
        return this;
    }

    public TaskListPage typeIntoTaskInput(String text) {
        type(TASK_INPUT, text);
        hideKeyboard();
        return this;
    }

    public String taskInputText() {
        return driver.findElement(TASK_INPUT).getText();
    }

    /** An empty EditText reports its hint ("New task") as text on most API levels. */
    public boolean isTaskInputEmpty() {
        String text = taskInputText();
        return text == null || text.isEmpty() || text.equals(TASK_INPUT_HINT);
    }

    public String errorMessage() {
        return textOf(ERROR);
    }

    public boolean isErrorShown() {
        return isPresent(ERROR);
    }

    // ---- reading the list ---------------------------------------------------

    public String summary() {
        return textOf(SUMMARY);
    }

    public boolean isEmptyStateShown() {
        return isPresent(EMPTY_STATE);
    }

    /** Titles of the rows currently on screen, top to bottom. */
    public List<String> visibleTaskTitles() {
        return driver.findElements(TASK_ROWS).stream()
                .map(WebElement::getText)
                .collect(Collectors.toList());
    }

    public boolean hasTask(String title) {
        return isPresent(taskRow(title));
    }

    public boolean isTaskDone(String title) {
        return Boolean.parseBoolean(waitVisible(taskRow(title)).getAttribute("checked"));
    }

    /** Scrolls the list until the task is on screen, using UiScrollable. */
    public TaskListPage scrollToTask(String title) {
        driver.findElement(AppiumBy.androidUIAutomator(
                "new UiScrollable(new UiSelector().scrollable(true))"
                        + ".scrollIntoView(" + rowSelector(title) + ")"));
        return this;
    }

    // ---- changing tasks -----------------------------------------------------

    public TaskListPage toggleTask(String title) {
        boolean wasDone = isTaskDone(title);
        tap(taskRow(title));
        wait.until(d -> isTaskDone(title) != wasDone);
        return this;
    }

    public DeleteDialog tapDelete(String title) {
        tap(AppiumBy.accessibilityId("Delete " + title));
        return new DeleteDialog(driver).waitUntilShown();
    }

    public TaskListPage clearCompleted() {
        tap(CLEAR_COMPLETED);
        return this;
    }

    public boolean isClearCompletedEnabled() {
        return waitVisible(CLEAR_COMPLETED).isEnabled();
    }

    public LoginPage logout() {
        tap(LOGOUT);
        return new LoginPage(driver).waitUntilLoaded();
    }

    // ---- locators -----------------------------------------------------------

    private static By taskRow(String title) {
        return AppiumBy.androidUIAutomator(rowSelector(title));
    }

    private static String rowSelector(String title) {
        return "new UiSelector().resourceId(\"" + TestConfig.APP_PACKAGE + ":id/task_checkbox\")"
                + ".text(" + javaString(title) + ")";
    }

    /** Quotes a value for use inside a UiAutomator selector expression. */
    private static String javaString(String value) {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }
}
