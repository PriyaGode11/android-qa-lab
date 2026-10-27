package com.qalab.tasklab.api;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;

import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.testcontainers.context.ImportTestcontainers;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

import com.qalab.tasklab.api.audit.AuditRepository;
import com.qalab.tasklab.api.support.FixedClockConfig;
import com.qalab.tasklab.api.support.PostgresContainer;
import com.qalab.tasklab.api.task.TaskRepository;
import com.qalab.tasklab.api.task.TaskRules;

/**
 * API integration tests: the whole application on a real port, a real PostgreSQL in Docker,
 * called over HTTP with REST Assured, the way the web or mobile app would call it.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(FixedClockConfig.class)
@ImportTestcontainers(PostgresContainer.class)
@DisplayName("Tasks API: integration")
class TaskApiIT {

    @LocalServerPort int port;
    @Autowired TaskRepository tasks;
    @Autowired AuditRepository audit;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        RestAssured.basePath = "/api";
        cleanTables();
    }

    @AfterEach
    void cleanTables() {
        // These rows are really committed: leave the shared database empty for other test classes.
        audit.deleteAllInBatch();
        tasks.deleteAllInBatch();
    }

    private static RequestSpecification as(String user) {
        return given().auth().preemptive().basic(user, "Passw0rd!").contentType(ContentType.JSON);
    }

    private static RequestSpecification admin() {
        return as("qa_user");
    }

    private static int create(String title, String priority, String due) {
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("title", title);
        if (priority != null) body.put("priority", priority);
        if (due != null) body.put("due", due);
        return admin().body(body).post("/tasks").then().statusCode(201).extract().path("id");
    }

    private static List<String> titles(String query) {
        return admin().get("/tasks" + query).then().statusCode(200).extract().jsonPath().getList("title", String.class);
    }

    @Nested
    @DisplayName("Creating tasks")
    class Creating {

        @Test
        @DisplayName("API-01 POST returns 201, a Location header and the stored task, which GET returns again")
        void createAndRead() {
            String location = admin().body(Map.of("title", "  Renew   passport ", "priority", "high", "due", "2026-11-05"))
                .post("/tasks")
                .then().statusCode(201)
                .header("Location", notNullValue())
                .body("title", equalTo("Renew passport"))
                .body("priority", equalTo("High"))
                .body("due", equalTo("2026-11-05"))
                .body("done", equalTo(false))
                .body("createdBy", equalTo("qa_user"))
                .body("createdAt", equalTo("2026-10-26T15:00:00Z"))
                .extract().header("Location");

            given().auth().preemptive().basic("qa_user", "Passw0rd!").basePath("")
                .get(location)
                .then().statusCode(200).body("title", equalTo("Renew passport"));
        }

        @Test
        @DisplayName("API-02 priority defaults to Medium")
        void defaultPriority() {
            admin().body(Map.of("title", "No priority given")).post("/tasks")
                .then().statusCode(201).body("priority", equalTo("Medium"));
        }

        static Stream<Arguments> invalidTitles() {
            return Stream.of(
                Arguments.of("", TaskRules.TASK_EMPTY),
                Arguments.of("      ", TaskRules.TASK_EMPTY),
                Arguments.of("x".repeat(41), TaskRules.TASK_TOO_LONG));
        }

        @ParameterizedTest(name = "API-03 rejects \"{0}\" with 400: {1}")
        @MethodSource("invalidTitles")
        void rejectsInvalidTitles(String title, String message) {
            admin().body(Map.of("title", title)).post("/tasks")
                .then().statusCode(400).body("message", equalTo(message));
            assertThat(tasks.count()).isZero();
        }

        @Test
        @DisplayName("API-04 exactly 40 characters is accepted (boundary)")
        void fortyCharacters() {
            admin().body(Map.of("title", "y".repeat(40))).post("/tasks").then().statusCode(201);
        }

        @Test
        @DisplayName("API-05 a duplicate in another letter case and spacing is a 409")
        void duplicate() {
            create("Buy milk", null, null);

            admin().body(Map.of("title", "BUY   milk")).post("/tasks")
                .then().statusCode(409).body("message", equalTo(TaskRules.TASK_DUPLICATE));
            assertThat(tasks.count()).isEqualTo(1);
        }

        @Test
        @DisplayName("API-06 the row in PostgreSQL holds exactly what the API returned")
        void storedInDatabase() {
            int id = create("Café, \"quoted\" & résumé", "Low", "2026-11-01");

            Map<String, Object> row = jdbc.queryForMap(
                "select title, title_key, priority, due_date, created_by from tasks where id = ?", id);
            assertThat(row.get("title")).isEqualTo("Café, \"quoted\" & résumé");
            assertThat(row.get("title_key")).isEqualTo("café, \"quoted\" & résumé");
            assertThat(row.get("priority")).isEqualTo("LOW");
            assertThat(row.get("due_date").toString()).isEqualTo("2026-11-01");
            assertThat(row.get("created_by")).isEqualTo("qa_user");
        }
    }

    @Nested
    @DisplayName("Reading, filtering and summary")
    class Reading {

        @BeforeEach
        void seed() {
            // Today is 2026-10-26 (fixed clock).
            create("Pay rent", "High", "2026-10-20");        // overdue
            create("Book flights", "Medium", "2026-10-26");  // due today: not overdue
            create("Renew passport", "High", "2026-11-05");
            create("Buy milk", "Low", null);
            int taxes = create("File taxes", "High", "2026-10-15");
            admin().body(Map.of("done", true)).patch("/tasks/" + taxes).then().statusCode(200);
        }

        @Test
        @DisplayName("API-07 the list is sorted by due date, tasks without a date last")
        void sortOrder() {
            assertThat(titles("")).containsExactly("File taxes", "Pay rent", "Book flights", "Renew passport", "Buy milk");
        }

        @Test
        @DisplayName("API-08 each filter alone and combined returns the right tasks")
        void filters() {
            assertThat(titles("?status=done")).containsExactly("File taxes");
            assertThat(titles("?priority=high")).containsExactly("File taxes", "Pay rent", "Renew passport");
            assertThat(titles("?q=PASS")).containsExactly("Renew passport");
            assertThat(titles("?from=2026-10-26&to=2026-10-26")).containsExactly("Book flights");
            assertThat(titles("?status=open&priority=high&to=2026-10-31")).containsExactly("Pay rent");
            assertThat(titles("?status=done&q=milk")).isEmpty();
        }

        @Test
        @DisplayName("API-09 summary and the overdue flag follow the rules (due today and done-late are not overdue)")
        void summaryAndOverdue() {
            admin().get("/tasks/summary").then().statusCode(200)
                .body("total", equalTo(5)).body("open", equalTo(4)).body("done", equalTo(1)).body("overdue", equalTo(1));

            assertThat(admin().get("/tasks").then().extract().jsonPath().getList("findAll { it.overdue }.title", String.class))
                .containsExactly("Pay rent");
        }

        @Test
        @DisplayName("API-10 bad filter values are a 400 that says what is allowed")
        void badFilters() {
            admin().get("/tasks?status=finished").then().statusCode(400)
                .body("message", equalTo("status must be one of: all, open, done"));
            admin().get("/tasks?priority=urgent").then().statusCode(400)
                .body("message", equalTo("priority must be Low, Medium or High"));
        }
    }

    @Nested
    @DisplayName("Changing and deleting")
    class Changing {

        @Test
        @DisplayName("API-11 PATCH completes and reopens a task; the change is stored")
        void completeAndReopen() {
            int id = create("Ship release", null, null);

            admin().body(Map.of("done", true)).patch("/tasks/" + id).then().statusCode(200).body("done", equalTo(true));
            assertThat(tasks.findById((long) id).orElseThrow().isDone()).isTrue();

            admin().body(Map.of("done", false)).patch("/tasks/" + id).then().statusCode(200).body("done", equalTo(false));
        }

        @Test
        @DisplayName("API-12 PATCH without \"done\" is a 400; on a missing task it is a 404")
        void badPatch() {
            int id = create("Patch me", null, null);
            admin().body(Map.of()).patch("/tasks/" + id).then().statusCode(400);
            admin().body(Map.of("done", true)).patch("/tasks/999999").then().statusCode(404)
                .body("message", equalTo("Task 999999 not found"));
        }

        @Test
        @DisplayName("API-13 DELETE returns 204; afterwards GET and a second DELETE are 404")
        void delete() {
            int id = create("Delete me", null, null);

            admin().delete("/tasks/" + id).then().statusCode(204);
            admin().get("/tasks/" + id).then().statusCode(404);
            admin().delete("/tasks/" + id).then().statusCode(404);
        }
    }

    @Nested
    @DisplayName("Security")
    class Security {

        static Stream<Arguments> accessRules() {
            return Stream.of(
                Arguments.of("GET", "/tasks", null, 401),
                Arguments.of("GET", "/tasks", "qa_viewer", 200),
                Arguments.of("GET", "/tasks/summary", "qa_viewer", 200),
                Arguments.of("POST", "/tasks", "qa_viewer", 403),
                Arguments.of("PATCH", "/tasks/1", "qa_viewer", 403),
                Arguments.of("DELETE", "/tasks/1", "qa_viewer", 403),
                Arguments.of("GET", "/audit", "qa_viewer", 403),
                Arguments.of("GET", "/audit", "qa_user", 200),
                Arguments.of("GET", "/audit", null, 401));
        }

        @ParameterizedTest(name = "API-14 {0} {1} as {2} -> {3}")
        @MethodSource("accessRules")
        void accessMatrix(String method, String path, String user, int expected) {
            RequestSpecification request = user == null ? given().contentType(ContentType.JSON) : as(user);
            if (method.equals("POST") || method.equals("PATCH")) {
                request = request.body("{\"title\":\"x\",\"done\":true}");
            }
            request.request(method, path).then().statusCode(expected);
        }

        @Test
        @DisplayName("API-15 a wrong password is a 401 and nothing is created")
        void wrongPassword() {
            given().auth().preemptive().basic("qa_user", "wrong").contentType(ContentType.JSON)
                .body(Map.of("title", "Should not exist")).post("/tasks")
                .then().statusCode(401);
            assertThat(tasks.count()).isZero();
        }
    }

    @Nested
    @DisplayName("Audit trail")
    class AuditTrail {

        @Test
        @DisplayName("API-16 create, complete and delete each write exactly one audit entry, newest first")
        void oneEntryPerAction() {
            int id = create("Audit me", "High", "2026-10-30");
            admin().body(Map.of("done", true)).patch("/tasks/" + id).then().statusCode(200);
            admin().body(Map.of("done", true)).patch("/tasks/" + id).then().statusCode(200); // no change: no entry
            admin().delete("/tasks/" + id).then().statusCode(204);

            var log = admin().get("/audit").then().statusCode(200).extract().jsonPath();
            assertThat(log.getList("action", String.class)).containsExactly("TASK_DELETED", "TASK_COMPLETED", "TASK_CREATED");
            assertThat(log.getList("user", String.class)).containsOnly("qa_user");
            assertThat(log.getString("[1].before")).isEqualTo("Open");
            assertThat(log.getString("[1].after")).isEqualTo("Done");
            assertThat(log.getString("[2].details")).isEqualTo("\"Audit me\" (High, due 2026-10-30)");
            assertThat(log.getString("[0].occurredAt")).isEqualTo("2026-10-26T15:00:00Z");
        }

        @Test
        @DisplayName("API-17 rejected requests leave no audit entry")
        void rejectedNotAudited() {
            admin().body(Map.of("title", "")).post("/tasks").then().statusCode(400);
            as("qa_viewer").body(Map.of("title", "x")).post("/tasks").then().statusCode(403);

            admin().get("/audit").then().statusCode(200).body("size()", equalTo(0));
        }

        @Test
        @DisplayName("API-18 the audit log can be filtered by action and has no way to change entries")
        void filterAndReadOnly() {
            create("One", null, null);
            create("Two", null, null);

            admin().get("/audit?action=TASK_CREATED").then().statusCode(200).body("size()", equalTo(2));
            // There is no endpoint to delete or edit audit entries: the server says the method isn't allowed.
            admin().delete("/audit").then().statusCode(405);
            admin().body(Map.of("action", "FAKE")).post("/audit").then().statusCode(405);
            assertThat(audit.count()).isEqualTo(2);
        }
    }
}
