package com.qalab.tasklab.api.task;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Locale;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * A task. The database itself enforces two rules as a safety net under the service:
 * titles are at most 40 characters, and unique ignoring letter case (via title_key).
 */
@Entity
@Table(name = "tasks", uniqueConstraints = @UniqueConstraint(name = "uk_tasks_title_key", columnNames = "title_key"))
public class Task {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = TaskRules.MAX_TITLE_LENGTH)
    private String title;

    /** Lower-case copy of the title, used for the case-insensitive unique constraint. */
    @Column(name = "title_key", nullable = false, length = TaskRules.MAX_TITLE_LENGTH)
    private String titleKey;

    @Column(nullable = false)
    private boolean done;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private Priority priority;

    @Column(name = "due_date")
    private LocalDate due;

    @Column(name = "created_by", nullable = false, length = 50)
    private String createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Task() {
        // for JPA
    }

    public Task(String title, Priority priority, LocalDate due, String createdBy, Instant createdAt) {
        this.title = title;
        this.titleKey = keyOf(title);
        this.priority = priority;
        this.due = due;
        this.createdBy = createdBy;
        this.createdAt = createdAt;
    }

    public static String keyOf(String title) {
        return title.toLowerCase(Locale.ROOT);
    }

    public Long getId() { return id; }
    public String getTitle() { return title; }
    public String getTitleKey() { return titleKey; }
    public boolean isDone() { return done; }
    public Priority getPriority() { return priority; }
    public LocalDate getDue() { return due; }
    public String getCreatedBy() { return createdBy; }
    public Instant getCreatedAt() { return createdAt; }

    public void setDone(boolean done) { this.done = done; }
}
