# TaskLab API: Backend Testing (JUnit 5, MockMvc, REST Assured, Testcontainers)

A Spring Boot REST API for TaskLab: the server side of the same app tested in the web and Android labs, with the **same rules** (title rules, duplicates, overdue, roles, audit trail). It's tested at every level of the testing pyramid below the UI.

```
              ┌───────────────────────────┐
              │ UI / end-to-end           │  Playwright (web), Appium (Android): other labs
              ├───────────────────────────┤
              │ API integration       28  │  whole app on a real port + real PostgreSQL, REST Assured
              │ Database integration   5  │  JPA mappings and constraints on real PostgreSQL
              ├───────────────────────────┤
              │ Web layer              9  │  controller, JSON, validation, security (MockMvc)
              │ Unit                  27  │  rules and service logic (JUnit 5, Mockito)
              └───────────────────────────┘
```

**69 test executions**: 36 fast tests (`mvn test`, about 10 seconds, no Docker) and 33 integration tests (`mvn verify`, needs Docker).

## The API

| Method | Path | Who | What |
|---|---|---|---|
| GET | `/api/tasks?status=&priority=&from=&to=&q=` | admin, viewer | List, with the same filters as the web dashboard |
| GET | `/api/tasks/summary` | admin, viewer | `{total, open, done, overdue}` |
| GET | `/api/tasks/{id}` | admin, viewer | One task |
| POST | `/api/tasks` | admin | Create: `{"title": "...", "priority": "High", "due": "2026-10-30"}` → 201 + Location |
| PATCH | `/api/tasks/{id}` | admin | `{"done": true}` to complete, `false` to reopen |
| DELETE | `/api/tasks/{id}` | admin | 204 |
| GET | `/api/audit?action=` | admin | Audit trail, newest first (read-only: no way to change entries) |

HTTP Basic auth with the demo users `qa_user` / `Passw0rd!` (admin) and `qa_viewer` / `Passw0rd!` (viewer). Errors always come back as `{status, error, message, path, timestamp}`.

## The tests

| Level | Class | IDs | What it proves |
|---|---|---|---|
| Unit | `TaskRulesTest` | UNIT-01 to 06 | Trimming and collapsing spaces; empty and whitespace titles; **39/40/41-character boundary**; length counted after clean-up; priority parsing in any letter case; clear error for unknown priorities (parameterized tests) |
| Unit | `TaskServiceTest` | SVC-01 to 10 | With **Mockito** fakes for the database and audit: saving the normalized title; 409 for duplicates with nothing saved or audited; invalid input never reaches the database; overdue rule (due today, done-but-late, no date); summary counts; audit with before/after; no-op updates not audited; 404s; bad filter values |
| Web layer | `TaskControllerTest` | WEB-01 to 09 | With **MockMvc**, the service mocked: 401 without or with wrong credentials; viewer can read but gets 403 on changes; 201 + Location + JSON shape; 400 messages for missing title, unknown priority, broken JSON and bad dates; 404 shape |
| Database | `TaskRepositoryIT` | DB-01 to 05 | On **real PostgreSQL** via **Testcontainers**: every field survives a round trip (dates, timestamps, enum); **the database itself** rejects duplicates in another letter case and titles over 40 characters; audit ordering |
| API | `TaskApiIT` | API-01 to 18 | Whole app on a real port + PostgreSQL, called with **REST Assured**: create/read/update/delete with exact status codes; validation and boundaries; 409 duplicates; the stored row checked directly with SQL; sorting and every filter alone and combined; summary and overdue; a **9-row access-control matrix** (who may call what); exactly one audit entry per change, none for rejected requests, and no way to edit the audit trail |

### Techniques worth pointing out

- **Fixed clock.** "Today" comes from an injected `Clock`; tests freeze it at Mon 26 Oct 2026, 10:00 Chicago, so "overdue" never depends on the day the tests run.
- **Real database in tests.** Testcontainers starts a throwaway PostgreSQL 16 in Docker, so tests catch problems an in-memory database would hide (column lengths, constraint names, SQL dialect).
- **Defence in depth.** Duplicates are blocked by the service (fast 409) and by a unique constraint in the database (safety net); DB-02 bypasses the service on purpose to prove the safety net works.
- **Same rules everywhere.** Error messages match the web and Android apps exactly ("Task already exists").
- **Coverage.** JaCoCo measures coverage across unit and integration tests: `target/site/jacoco/index.html`.

## Run it on your computer

Needs **Java 17** and **Maven**. The integration tests also need **Docker Desktop** running.

```bash
cd backend-api
mvn test                 # unit + web-layer tests (no Docker)
mvn verify               # everything, including PostgreSQL integration tests + coverage report
mvn spring-boot:run      # start the API on http://localhost:8080 (in-memory database)
```

Try it:
```bash
curl -u qa_user:Passw0rd! -H "Content-Type: application/json" \
     -d '{"title":"Buy milk","priority":"High"}' http://localhost:8080/api/tasks
curl -u qa_user:Passw0rd! "http://localhost:8080/api/tasks?status=open"
curl -u qa_user:Passw0rd! http://localhost:8080/api/audit
```

## CI

The **Backend** job in `.github/workflows/mobile-web.yml` runs `mvn verify` on GitHub's Ubuntu runner (Docker included), then the website gets:

| Address | What it is |
|---|---|
| `/backend-tests/` | results page: by test level, by area, failures with messages, trend, slowest tests |
| `/backend-coverage/` | JaCoCo code coverage report |

`src/test/resources/docker-java.properties` pins the Docker API version, because Docker 29 refuses the older default that Testcontainers 1.x requests.
