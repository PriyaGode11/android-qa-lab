package com.qalab.tasklab.api.task;

import java.util.Optional;

/** The task rules, identical to the web and Android apps. Pure functions: easy to unit test. */
public final class TaskRules {

    public static final int MAX_TITLE_LENGTH = 40;

    public static final String TASK_EMPTY = "Task cannot be empty";
    public static final String TASK_TOO_LONG = "Task must be 40 characters or fewer";
    public static final String TASK_DUPLICATE = "Task already exists";

    private TaskRules() {
    }

    /** Trims the title and collapses runs of whitespace into single spaces. */
    public static String normalize(String raw) {
        return raw == null ? "" : raw.strip().replaceAll("\\s+", " ");
    }

    /** The reason a normalized title is not allowed, or empty when it is fine. */
    public static Optional<String> problemWith(String normalizedTitle) {
        if (normalizedTitle.isEmpty()) {
            return Optional.of(TASK_EMPTY);
        }
        if (normalizedTitle.length() > MAX_TITLE_LENGTH) {
            return Optional.of(TASK_TOO_LONG);
        }
        return Optional.empty();
    }
}
