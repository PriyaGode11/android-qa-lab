package com.qalab.tasklab.pages;

import io.appium.java_client.android.AndroidDriver;
import org.openqa.selenium.By;

/** The "Delete task?" confirmation dialog (a standard AlertDialog). */
public class DeleteDialog extends BasePage {

    private static final By MESSAGE = androidId("message");
    private static final By CONFIRM = androidId("button1");
    private static final By CANCEL = androidId("button2");

    public DeleteDialog(AndroidDriver driver) {
        super(driver);
    }

    DeleteDialog waitUntilShown() {
        waitVisible(MESSAGE);
        return this;
    }

    public String message() {
        return textOf(MESSAGE);
    }

    public TaskListPage confirm() {
        tap(CONFIRM);
        waitGone(MESSAGE);
        return new TaskListPage(driver);
    }

    public TaskListPage cancel() {
        tap(CANCEL);
        waitGone(MESSAGE);
        return new TaskListPage(driver);
    }
}
