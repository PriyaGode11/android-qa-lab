package com.qalab.tasklab.listeners;

import com.qalab.tasklab.config.TestConfig;
import com.qalab.tasklab.driver.DriverManager;
import io.appium.java_client.android.AndroidDriver;
import org.openqa.selenium.OutputType;
import org.testng.ITestListener;
import org.testng.ITestResult;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

/**
 * On every failure, saves a screenshot and the UI hierarchy (page source) so a
 * failing CI run can be diagnosed without re-running it.
 */
public class FailureArtifactsListener implements ITestListener {

    @Override
    public void onTestStart(ITestResult result) {
        System.out.println("▶ " + name(result));
    }

    @Override
    public void onTestSuccess(ITestResult result) {
        System.out.println("✔ " + name(result));
    }

    @Override
    public void onTestFailure(ITestResult result) {
        System.out.println("✘ " + name(result) + " — " + result.getThrowable());
        AndroidDriver driver = DriverManager.get();
        if (driver == null) {
            return;
        }
        try {
            Path dir = Path.of(TestConfig.artifactsDir());
            Files.createDirectories(dir);
            String base = name(result).replaceAll("[^A-Za-z0-9._-]", "_");

            Path screenshot = driver.getScreenshotAs(OutputType.FILE).toPath();
            Files.copy(screenshot, dir.resolve(base + ".png"), StandardCopyOption.REPLACE_EXISTING);
            Files.writeString(dir.resolve(base + ".xml"), driver.getPageSource(), StandardCharsets.UTF_8);

            System.out.println("  artifacts saved to " + dir.toAbsolutePath());
        } catch (IOException | RuntimeException e) {
            System.out.println("  could not save failure artifacts: " + e.getMessage());
        }
    }

    private static String name(ITestResult result) {
        String base = result.getTestClass().getRealClass().getSimpleName() + "." + result.getMethod().getMethodName();
        Object[] params = result.getParameters();
        return params.length == 0 ? base : base + "#" + result.getMethod().getCurrentInvocationCount();
    }
}
