package com.qalab.tasklab.pages;

import com.qalab.tasklab.config.TestConfig;
import io.appium.java_client.AppiumBy;
import io.appium.java_client.android.AndroidDriver;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriverException;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.util.List;

/** Shared helpers for every screen object. All waits are explicit. */
public abstract class BasePage {

    protected final AndroidDriver driver;
    protected final WebDriverWait wait;

    protected BasePage(AndroidDriver driver) {
        this.driver = driver;
        this.wait = new WebDriverWait(driver, TestConfig.waitTimeout());
    }

    /** Locator for a view in the app under test by its android:id. */
    protected static By id(String resourceId) {
        return AppiumBy.id(TestConfig.APP_PACKAGE + ":id/" + resourceId);
    }

    /** Locator for a framework view, e.g. dialog buttons (android:id/button1). */
    protected static By androidId(String resourceId) {
        return AppiumBy.id("android:id/" + resourceId);
    }

    protected WebElement waitVisible(By locator) {
        return wait.until(ExpectedConditions.visibilityOfElementLocated(locator));
    }

    protected void waitGone(By locator) {
        wait.until(ExpectedConditions.invisibilityOfElementLocated(locator));
    }

    protected void tap(By locator) {
        wait.until(ExpectedConditions.elementToBeClickable(locator)).click();
    }

    protected void type(By locator, String text) {
        WebElement field = waitVisible(locator);
        field.clear();
        if (!text.isEmpty()) {
            field.sendKeys(text);
        }
    }

    protected String textOf(By locator) {
        return waitVisible(locator).getText();
    }

    /** Non-waiting presence check; safe to use for "should not be shown" assertions. */
    protected boolean isPresent(By locator) {
        List<WebElement> found = driver.findElements(locator);
        return !found.isEmpty() && found.get(0).isDisplayed();
    }

    protected void hideKeyboard() {
        try {
            if (driver.isKeyboardShown()) {
                driver.hideKeyboard();
            }
        } catch (WebDriverException ignored) {
            // Some IMEs refuse to hide; the tests don't depend on it.
        }
    }
}
