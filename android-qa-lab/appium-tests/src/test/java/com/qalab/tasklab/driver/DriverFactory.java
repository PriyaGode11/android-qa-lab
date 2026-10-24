package com.qalab.tasklab.driver;

import com.qalab.tasklab.config.TestConfig;
import io.appium.java_client.android.AndroidDriver;
import io.appium.java_client.android.options.UiAutomator2Options;

import java.net.MalformedURLException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;

/** Builds an AndroidDriver session against the UiAutomator2 driver. */
public final class DriverFactory {

    private DriverFactory() {
    }

    public static AndroidDriver create() {
        Path apk = Path.of(TestConfig.appPath()).toAbsolutePath().normalize();
        if (!Files.exists(apk)) {
            throw new IllegalStateException(
                    "APK not found at " + apk + ". Build it with ./gradlew assembleDebug "
                            + "or pass -Dapp.path=/path/to/app-debug.apk");
        }

        UiAutomator2Options options = new UiAutomator2Options()
                .setDeviceName(TestConfig.deviceName())
                .setApp(apk.toString())
                .setAppPackage(TestConfig.APP_PACKAGE)
                .setAppActivity(TestConfig.LAUNCH_ACTIVITY)
                .setAutoGrantPermissions(true)
                .setNewCommandTimeout(Duration.ofSeconds(120))
                // Keep the install between sessions; each test clears app data instead.
                .setNoReset(false)
                .setFullReset(false);
        options.setCapability("appium:disableWindowAnimation", true);

        if (!TestConfig.udid().isEmpty()) {
            options.setUdid(TestConfig.udid());
        }
        if (!TestConfig.platformVersion().isEmpty()) {
            options.setPlatformVersion(TestConfig.platformVersion());
        }

        try {
            AndroidDriver driver = new AndroidDriver(URI.create(TestConfig.appiumUrl()).toURL(), options);
            // Explicit waits only: implicit waits make "is it gone?" checks slow and flaky.
            driver.manage().timeouts().implicitlyWait(Duration.ZERO);
            return driver;
        } catch (MalformedURLException e) {
            throw new IllegalArgumentException("Bad Appium URL: " + TestConfig.appiumUrl(), e);
        }
    }
}
