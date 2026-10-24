package com.qalab.tasklab.config;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.time.Duration;
import java.util.Properties;

/**
 * Resolves settings in this order: system property, environment variable,
 * config.properties, built-in default.
 */
public final class TestConfig {

    public static final String APP_PACKAGE = "com.qalab.tasklab";
    public static final String LAUNCH_ACTIVITY = ".ui.LoginActivity";

    public static final String VALID_USERNAME = "qa_user";
    public static final String VALID_PASSWORD = "Passw0rd!";

    private static final Properties FILE = load();

    private TestConfig() {
    }

    public static String appiumUrl() {
        return get("appium.url", "http://127.0.0.1:4723");
    }

    public static String appPath() {
        return get("app.path", "../android-app/app/build/outputs/apk/debug/app-debug.apk");
    }

    public static String deviceName() {
        return get("device.name", "Android Emulator");
    }

    public static String udid() {
        return get("device.udid", "");
    }

    public static String platformVersion() {
        return get("platform.version", "");
    }

    public static Duration waitTimeout() {
        return Duration.ofSeconds(Long.parseLong(get("wait.timeout", "10")));
    }

    public static String artifactsDir() {
        return get("artifacts.dir", "target/artifacts");
    }

    private static String get(String key, String fallback) {
        String value = System.getProperty(key);
        if (isBlank(value)) {
            value = System.getenv(key.toUpperCase().replace('.', '_'));
        }
        if (isBlank(value)) {
            value = FILE.getProperty(key);
        }
        return isBlank(value) ? fallback : value.trim();
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static Properties load() {
        Properties props = new Properties();
        try (InputStream in = TestConfig.class.getResourceAsStream("/config.properties")) {
            if (in != null) {
                props.load(in);
            }
        } catch (IOException e) {
            throw new UncheckedIOException("Could not read config.properties", e);
        }
        return props;
    }
}
