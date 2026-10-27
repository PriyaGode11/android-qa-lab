package com.qalab.tasklab.api.task;

import java.time.Instant;
import java.time.LocalDate;

import jakarta.validation.constraints.NotNull;

/** Request and response bodies of the tasks API. */
public final class TaskDtos {

    private TaskDtos() {
    }

    public record CreateTaskRequest(
        @NotNull(message = TaskRules.TASK_EMPTY) String title,
        Priority priority,
        LocalDate due) {
    }

    public record UpdateTaskRequest(Boolean done) {
    }

    public record TaskResponse(
        Long id,
        String title,
        boolean done,
        Priority priority,
        LocalDate due,
        boolean overdue,
        String createdBy,
        Instant createdAt) {

        static TaskResponse of(Task t, boolean overdue) {
            return new TaskResponse(t.getId(), t.getTitle(), t.isDone(), t.getPriority(), t.getDue(),
                overdue, t.getCreatedBy(), t.getCreatedAt());
        }
    }

    public record TaskSummary(long total, long open, long done, long overdue) {
    }

    /** Dashboard filters; each is optional. */
    public record TaskFilter(String status, String priority, LocalDate from, LocalDate to, String q) {
    }
}
