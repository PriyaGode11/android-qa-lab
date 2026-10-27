package com.qalab.tasklab.api.task;

import java.time.Clock;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.qalab.tasklab.api.audit.AuditService;
import com.qalab.tasklab.api.error.ApiException;
import com.qalab.tasklab.api.task.TaskDtos.CreateTaskRequest;
import com.qalab.tasklab.api.task.TaskDtos.TaskFilter;
import com.qalab.tasklab.api.task.TaskDtos.TaskResponse;
import com.qalab.tasklab.api.task.TaskDtos.TaskSummary;
import com.qalab.tasklab.api.task.TaskDtos.UpdateTaskRequest;

@Service
@Transactional
public class TaskService {

    private static final Set<String> STATUSES = Set.of("all", "open", "done");

    /** Due date first (no due date last), then title: the same order as the web dashboard. */
    private static final Comparator<Task> DASHBOARD_ORDER = Comparator
        .comparing(Task::getDue, Comparator.nullsLast(Comparator.naturalOrder()))
        .thenComparing(Task::getTitle, String.CASE_INSENSITIVE_ORDER);

    private final TaskRepository tasks;
    private final AuditService audit;
    private final Clock clock;

    public TaskService(TaskRepository tasks, AuditService audit, Clock clock) {
        this.tasks = tasks;
        this.audit = audit;
        this.clock = clock;
    }

    public TaskResponse create(CreateTaskRequest request, String user) {
        String title = TaskRules.normalize(request.title());
        TaskRules.problemWith(title).ifPresent(problem -> {
            throw ApiException.badRequest(problem);
        });
        if (tasks.existsByTitleKey(Task.keyOf(title))) {
            throw new ApiException(HttpStatus.CONFLICT, TaskRules.TASK_DUPLICATE);
        }
        Priority priority = request.priority() == null ? Priority.MEDIUM : request.priority();

        Task saved = tasks.save(new Task(title, priority, request.due(), user, clock.instant()));
        audit.record(user, "TASK_CREATED", "\"" + title + "\" (" + priority.label()
            + (request.due() == null ? "" : ", due " + request.due()) + ")");
        return toResponse(saved);
    }

    @Transactional(readOnly = true)
    public TaskResponse get(long id) {
        return toResponse(find(id));
    }

    @Transactional(readOnly = true)
    public List<TaskResponse> list(TaskFilter filter) {
        String status = filter.status() == null ? "all" : filter.status().strip().toLowerCase(Locale.ROOT);
        if (!STATUSES.contains(status)) {
            throw ApiException.badRequest("status must be one of: all, open, done");
        }
        Priority priority = filter.priority() == null || filter.priority().isBlank() || filter.priority().equalsIgnoreCase("all")
            ? null : parsePriority(filter.priority());
        String q = filter.q() == null ? "" : filter.q().strip().toLowerCase(Locale.ROOT);

        return tasks.findAll().stream()
            .filter(t -> status.equals("all") || (status.equals("done") == t.isDone()))
            .filter(t -> priority == null || t.getPriority() == priority)
            .filter(t -> filter.from() == null || (t.getDue() != null && !t.getDue().isBefore(filter.from())))
            .filter(t -> filter.to() == null || (t.getDue() != null && !t.getDue().isAfter(filter.to())))
            .filter(t -> q.isEmpty() || t.getTitle().toLowerCase(Locale.ROOT).contains(q))
            .sorted(DASHBOARD_ORDER)
            .map(this::toResponse)
            .toList();
    }

    public TaskResponse update(long id, UpdateTaskRequest request, String user) {
        if (request == null || request.done() == null) {
            throw ApiException.badRequest("Nothing to update: send {\"done\": true} or {\"done\": false}");
        }
        Task task = find(id);
        boolean before = task.isDone();
        boolean after = request.done();
        if (before != after) {
            task.setDone(after);
            audit.record(user, after ? "TASK_COMPLETED" : "TASK_REOPENED", "\"" + task.getTitle() + "\"",
                before ? "Done" : "Open", after ? "Done" : "Open");
        }
        return toResponse(task);
    }

    public void delete(long id, String user) {
        Task task = find(id);
        tasks.delete(task);
        audit.record(user, "TASK_DELETED", "\"" + task.getTitle() + "\"");
    }

    @Transactional(readOnly = true)
    public TaskSummary summary() {
        List<Task> all = tasks.findAll();
        long done = all.stream().filter(Task::isDone).count();
        long overdue = all.stream().filter(this::isOverdue).count();
        return new TaskSummary(all.size(), all.size() - done, done, overdue);
    }

    /** Open and due before today. A task due today is not overdue; a late but done task is not either. */
    boolean isOverdue(Task task) {
        return !task.isDone() && task.getDue() != null && task.getDue().isBefore(LocalDate.now(clock));
    }

    private Task find(long id) {
        return tasks.findById(id).orElseThrow(() -> ApiException.notFound("Task", id));
    }

    private static Priority parsePriority(String value) {
        try {
            return Priority.from(value);
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest(e.getMessage());
        }
    }

    private TaskResponse toResponse(Task task) {
        return TaskResponse.of(task, isOverdue(task));
    }
}
