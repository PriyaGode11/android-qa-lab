package com.qalab.tasklab.api.task;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.qalab.tasklab.api.config.SecurityConfig;
import com.qalab.tasklab.api.error.ApiException;
import com.qalab.tasklab.api.task.TaskDtos.TaskResponse;

/**
 * Web-layer tests: the real controller, JSON mapping, validation, error handler and
 * security rules, with the service replaced by a mock. No database, no server.
 */
@WebMvcTest(TaskController.class)
@Import(SecurityConfig.class)
@DisplayName("Tasks API: web layer")
class TaskControllerTest {

    @Autowired MockMvc mvc;
    @MockitoBean TaskService service;

    private static final TaskResponse BUY_MILK = new TaskResponse(1L, "Buy milk", false, Priority.HIGH, null, false,
        "qa_user", Instant.parse("2026-10-26T15:00:00Z"));

    @Test
    @DisplayName("WEB-01 no credentials: 401 and the service is never called")
    void noCredentials() throws Exception {
        mvc.perform(get("/api/tasks")).andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }

    @Test
    @DisplayName("WEB-02 wrong password: 401")
    void wrongPassword() throws Exception {
        mvc.perform(get("/api/tasks").with(httpBasic("qa_user", "nope"))).andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("WEB-03 a viewer may read but gets 403 when trying to create or delete")
    void viewerIsReadOnly() throws Exception {
        when(service.list(any())).thenReturn(List.of(BUY_MILK));
        mvc.perform(get("/api/tasks").with(httpBasic("qa_viewer", "Passw0rd!")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].title").value("Buy milk"));

        mvc.perform(post("/api/tasks").with(httpBasic("qa_viewer", "Passw0rd!"))
                .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"Nope\"}"))
            .andExpect(status().isForbidden());
        mvc.perform(delete("/api/tasks/1").with(httpBasic("qa_viewer", "Passw0rd!")))
            .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("WEB-04 creating returns 201, a Location header and the task as JSON")
    void createReturns201() throws Exception {
        when(service.create(any(), eq("qa_user"))).thenReturn(BUY_MILK);

        mvc.perform(post("/api/tasks").with(httpBasic("qa_user", "Passw0rd!"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Buy milk\",\"priority\":\"high\"}"))
            .andExpect(status().isCreated())
            .andExpect(header().string("Location", "/api/tasks/1"))
            .andExpect(jsonPath("$.priority").value("High"))
            .andExpect(jsonPath("$.createdAt").value("2026-10-26T15:00:00Z"));
    }

    @Test
    @DisplayName("WEB-05 a missing title is a 400 with the same message as the app")
    void missingTitle() throws Exception {
        mvc.perform(post("/api/tasks").with(httpBasic("qa_user", "Passw0rd!"))
                .contentType(MediaType.APPLICATION_JSON).content("{\"priority\":\"Low\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value(TaskRules.TASK_EMPTY))
            .andExpect(jsonPath("$.path").value("/api/tasks"));
    }

    @Test
    @DisplayName("WEB-06 an unknown priority is a 400 that names the allowed values")
    void badPriority() throws Exception {
        mvc.perform(post("/api/tasks").with(httpBasic("qa_user", "Passw0rd!"))
                .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"x\",\"priority\":\"urgent\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Invalid request body: priority must be Low, Medium or High"));
    }

    @Test
    @DisplayName("WEB-07 broken JSON is a 400, not a 500")
    void malformedJson() throws Exception {
        mvc.perform(post("/api/tasks").with(httpBasic("qa_user", "Passw0rd!"))
                .contentType(MediaType.APPLICATION_JSON).content("{\"title\": "))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Invalid request body: malformed JSON"));
    }

    @Test
    @DisplayName("WEB-08 an invalid date filter is a 400 naming the parameter")
    void badDateParam() throws Exception {
        mvc.perform(get("/api/tasks").param("from", "26/10/2026").with(httpBasic("qa_user", "Passw0rd!")))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value("Invalid value for 'from': 26/10/2026"));
    }

    @Test
    @DisplayName("WEB-09 a missing task is a 404 with a readable message")
    void notFound() throws Exception {
        when(service.get(42L)).thenThrow(ApiException.notFound("Task", 42L));

        mvc.perform(get("/api/tasks/42").with(httpBasic("qa_user", "Passw0rd!")))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.status").value(404))
            .andExpect(jsonPath("$.message").value("Task 42 not found"));
    }
}
