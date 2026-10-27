package com.qalab.tasklab.api.task;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

/** Unit tests: pure rules, no Spring, no database. They run in milliseconds. */
@DisplayName("Task rules")
class TaskRulesTest {

    @ParameterizedTest(name = "\"{0}\" becomes \"{1}\"")
    @CsvSource(delimiter = '|', value = {
        "Buy milk|Buy milk",
        "'  Buy milk  '|Buy milk",
        "'Pay    rent'|Pay rent",
        "'Tabs\tinside'|Tabs inside",
    })
    @DisplayName("UNIT-01 titles are trimmed and inner whitespace collapsed")
    void normalizes(String raw, String expected) {
        assertThat(TaskRules.normalize(raw)).isEqualTo(expected);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   ", "\t\n"})
    @DisplayName("UNIT-02 empty or whitespace-only titles are rejected")
    void rejectsEmpty(String raw) {
        assertThat(TaskRules.problemWith(TaskRules.normalize(raw))).contains(TaskRules.TASK_EMPTY);
    }

    @Test
    @DisplayName("UNIT-03 exactly 40 characters is allowed, 41 is not (boundary values)")
    void lengthBoundary() {
        assertThat(TaskRules.problemWith("a".repeat(39))).isEmpty();
        assertThat(TaskRules.problemWith("a".repeat(40))).isEmpty();
        assertThat(TaskRules.problemWith("a".repeat(41))).contains(TaskRules.TASK_TOO_LONG);
    }

    @Test
    @DisplayName("UNIT-04 the length limit applies after spaces are collapsed")
    void lengthCountedAfterNormalizing() {
        String padded = "  " + "a".repeat(20) + "          " + "b".repeat(19) + "  ";
        String normalized = TaskRules.normalize(padded);
        assertThat(normalized).hasSize(40);
        assertThat(TaskRules.problemWith(normalized)).isEmpty();
    }

    @ParameterizedTest(name = "\"{0}\" -> {1}")
    @CsvSource({"Low,LOW", "medium,MEDIUM", "HIGH,HIGH", "' High ',HIGH"})
    @DisplayName("UNIT-05 priority accepts any letter case")
    void priorityParsing(String input, Priority expected) {
        assertThat(Priority.from(input)).isEqualTo(expected);
    }

    @ParameterizedTest
    @ValueSource(strings = {"urgent", "", "3"})
    @DisplayName("UNIT-06 unknown priorities are refused with a clear message")
    void priorityRejectsUnknown(String input) {
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> Priority.from(input))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessage("priority must be Low, Medium or High");
    }
}
