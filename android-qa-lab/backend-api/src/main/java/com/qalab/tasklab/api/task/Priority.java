package com.qalab.tasklab.api.task;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** Written and read as "Low", "Medium", "High" (any letter case is accepted on input). */
public enum Priority {
    LOW("Low"), MEDIUM("Medium"), HIGH("High");

    private final String label;

    Priority(String label) {
        this.label = label;
    }

    @JsonValue
    public String label() {
        return label;
    }

    @JsonCreator
    public static Priority from(String value) {
        if (value != null) {
            for (Priority p : values()) {
                if (p.label.equalsIgnoreCase(value.strip())) {
                    return p;
                }
            }
        }
        throw new IllegalArgumentException("priority must be Low, Medium or High");
    }
}
