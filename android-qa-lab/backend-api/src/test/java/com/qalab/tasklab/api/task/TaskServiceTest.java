package com.qalab.tasklab.api.task;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;

import com.qalab.tasklab.api.audit.AuditService;
import com.qalab.tasklab.api.error.ApiException;
import com.qalab.tasklab.api.task.TaskDtos.CreateTaskRequest;
import com.qalab.tasklab.api.task.TaskDtos.TaskFilter;
import com.qalab.tasklab.api.task.TaskDtos.UpdateTaskRequest;

/**
 * Unit tests for the service with Mockito: the repository and audit log are fakes, so these
 * test the business logic alone, fast, without Spring or a database.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("Task service")
class TaskServiceTest {

    /** Monday 26 Oct 2026, 10:00 in Chicago. */
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-10-26T15:00:00Z"), ZoneId.of("America/Chicago"));
    private static final LocalDate TODAY = LocalDate.of(2026, 10, 26);

    @Mock TaskRepository repository;
    @Mock AuditService audit;

    TaskService service;

    @BeforeEach
    void setUp() {
        service = new TaskService(repository, audit, CLOCK);
    }

    private static Task task(String title, boolean done, LocalDate due) {
        Task t = new Task(title, Priority.MEDIUM, due, "qa_user", CLOCK.instant());
        t.setDone(done);
        return t;
    }

    @Test
    @DisplayName("SVC-01 creating saves the normalized title, defaults priority to Medium and writes one audit entry")
    void createSavesAndAudits() {
        when(repository.existsByTitleKey("pay rent")).thenReturn(false);
        when(repository.save(any(Task.class))).thenAnswer(inv -> inv.getArgument(0));

        var response = service.create(new CreateTaskRequest("  Pay    rent ", null, null), "qa_user");

        ArgumentCaptor<Task> saved = ArgumentCaptor.forClass(Task.class);
        verify(repository).save(saved.capture());
        assertThat(saved.getValue().getTitle()).isEqualTo("Pay rent");
        assertThat(saved.getValue().getTitleKey()).isEqualTo("pay rent");
        assertThat(saved.getValue().getCreatedAt()).isEqualTo(CLOCK.instant());
        assertThat(response.priority()).isEqualTo(Priority.MEDIUM);
        verify(audit).record("qa_user", "TASK_CREATED", "\"Pay rent\" (Medium)");
    }

    @Test
    @DisplayName("SVC-02 a duplicate (any letter case) is refused with 409 and nothing is saved or audited")
    void duplicateIsConflict() {
        when(repository.existsByTitleKey("buy milk")).thenReturn(true);

        assertThatThrownBy(() -> service.create(new CreateTaskRequest("BUY milk", Priority.LOW, null), "qa_user"))
            .isInstanceOfSatisfying(ApiException.class, e -> {
                assertThat(e.getStatus()).isEqualTo(HttpStatus.CONFLICT);
                assertThat(e.getMessage()).isEqualTo(TaskRules.TASK_DUPLICATE);
            });
        verify(repository, never()).save(any());
        verifyNoInteractions(audit);
    }

    @Test
    @DisplayName("SVC-03 an invalid title is refused with 400 before touching the database")
    void invalidTitleNeverReachesDatabase() {
        assertThatThrownBy(() -> service.create(new CreateTaskRequest("x".repeat(41), null, null), "qa_user"))
            .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST));
        verifyNoInteractions(repository, audit);
    }

    @Test
    @DisplayName("SVC-04 overdue means open and due before today: due today, done-but-late and no date are not overdue")
    void overdueRule() {
        assertThat(service.isOverdue(task("late", false, TODAY.minusDays(1)))).isTrue();
        assertThat(service.isOverdue(task("today", false, TODAY))).isFalse();
        assertThat(service.isOverdue(task("late but done", true, TODAY.minusDays(5)))).isFalse();
        assertThat(service.isOverdue(task("no date", false, null))).isFalse();
    }

    @Test
    @DisplayName("SVC-05 summary counts total, open, done and overdue")
    void summary() {
        when(repository.findAll()).thenReturn(List.of(
            task("a", false, TODAY.minusDays(2)),
            task("b", false, TODAY),
            task("c", true, TODAY.minusDays(9)),
            task("d", false, null)));

        assertThat(service.summary()).isEqualTo(new TaskDtos.TaskSummary(4, 3, 1, 1));
    }

    @Test
    @DisplayName("SVC-06 completing a task audits the change with before and after values")
    void completeAudits() {
        Task t = task("Ship it", false, null);
        when(repository.findById(7L)).thenReturn(Optional.of(t));

        var response = service.update(7L, new UpdateTaskRequest(true), "qa_user");

        assertThat(response.done()).isTrue();
        verify(audit).record("qa_user", "TASK_COMPLETED", "\"Ship it\"", "Open", "Done");
    }

    @Test
    @DisplayName("SVC-07 setting a task to the state it already has changes nothing and audits nothing")
    void noOpUpdateIsNotAudited() {
        when(repository.findById(7L)).thenReturn(Optional.of(task("Already done", true, null)));

        service.update(7L, new UpdateTaskRequest(true), "qa_user");

        verify(audit, never()).record(anyString(), anyString(), anyString(), any(), any());
    }

    @Test
    @DisplayName("SVC-08 updating or deleting a missing task is a 404")
    void missingTaskIs404() {
        when(repository.findById(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.update(99L, new UpdateTaskRequest(true), "qa_user"))
            .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getStatus()).isEqualTo(HttpStatus.NOT_FOUND));
        assertThatThrownBy(() -> service.delete(99L, "qa_user"))
            .hasMessage("Task 99 not found");
    }

    @Test
    @DisplayName("SVC-09 an unknown status filter is a 400 with the allowed values")
    void badStatusFilter() {
        assertThatThrownBy(() -> service.list(new TaskFilter("finished", null, null, null, null)))
            .hasMessage("status must be one of: all, open, done");
    }

    @Test
    @DisplayName("SVC-10 deleting audits the title of the removed task")
    void deleteAudits() {
        Task t = task("Remove me", false, null);
        when(repository.findById(3L)).thenReturn(Optional.of(t));

        service.delete(3L, "qa_user");

        verify(repository).delete(t);
        verify(audit).record(eq("qa_user"), eq("TASK_DELETED"), eq("\"Remove me\""));
    }
}
