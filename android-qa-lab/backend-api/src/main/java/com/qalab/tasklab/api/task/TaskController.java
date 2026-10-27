package com.qalab.tasklab.api.task;

import java.net.URI;
import java.security.Principal;
import java.time.LocalDate;
import java.util.List;

import jakarta.validation.Valid;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.qalab.tasklab.api.task.TaskDtos.CreateTaskRequest;
import com.qalab.tasklab.api.task.TaskDtos.TaskFilter;
import com.qalab.tasklab.api.task.TaskDtos.TaskResponse;
import com.qalab.tasklab.api.task.TaskDtos.TaskSummary;
import com.qalab.tasklab.api.task.TaskDtos.UpdateTaskRequest;

/**
 * GET    /api/tasks?status=&priority=&from=&to=&q=   list with dashboard filters
 * GET    /api/tasks/summary                           total / open / done / overdue
 * GET    /api/tasks/{id}                              one task
 * POST   /api/tasks                                   create   (admin)
 * PATCH  /api/tasks/{id}   {"done": true|false}       complete or reopen (admin)
 * DELETE /api/tasks/{id}                              delete   (admin)
 */
@RestController
@RequestMapping("/api/tasks")
public class TaskController {

    private final TaskService service;

    public TaskController(TaskService service) {
        this.service = service;
    }

    @GetMapping
    public List<TaskResponse> list(
        @RequestParam(required = false) String status,
        @RequestParam(required = false) String priority,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
        @RequestParam(required = false) String q) {
        return service.list(new TaskFilter(status, priority, from, to, q));
    }

    @GetMapping("/summary")
    public TaskSummary summary() {
        return service.summary();
    }

    @GetMapping("/{id}")
    public TaskResponse get(@PathVariable long id) {
        return service.get(id);
    }

    @PostMapping
    public ResponseEntity<TaskResponse> create(@Valid @RequestBody CreateTaskRequest request, Principal user) {
        TaskResponse created = service.create(request, user.getName());
        return ResponseEntity.created(URI.create("/api/tasks/" + created.id())).body(created);
    }

    @PatchMapping("/{id}")
    public TaskResponse update(@PathVariable long id, @RequestBody UpdateTaskRequest request, Principal user) {
        return service.update(id, request, user.getName());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable long id, Principal user) {
        service.delete(id, user.getName());
        return ResponseEntity.noContent().build();
    }
}
