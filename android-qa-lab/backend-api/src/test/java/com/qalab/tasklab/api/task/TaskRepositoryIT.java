package com.qalab.tasklab.api.task;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.time.LocalDate;

import jakarta.persistence.EntityManager;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.context.ImportTestcontainers;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;

import com.qalab.tasklab.api.audit.AuditEntry;
import com.qalab.tasklab.api.audit.AuditRepository;
import com.qalab.tasklab.api.support.PostgresContainer;

/**
 * Database integration tests: the JPA mappings and constraints against a real PostgreSQL
 * (not an in-memory imitation), started by Testcontainers. Each test runs in a transaction
 * that is rolled back afterwards, so tests don't see each other's data.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ImportTestcontainers(PostgresContainer.class)
@DisplayName("Repositories on PostgreSQL")
class TaskRepositoryIT {

    private static final Instant NOW = Instant.parse("2026-10-26T15:00:00Z");

    @Autowired TaskRepository tasks;
    @Autowired AuditRepository audit;
    @Autowired EntityManager em;

    @Test
    @DisplayName("DB-01 every field survives a round trip through PostgreSQL (dates, timestamps, enum)")
    void roundTrip() {
        Task saved = tasks.saveAndFlush(new Task("Renew passport", Priority.HIGH, LocalDate.of(2026, 11, 5), "qa_user", NOW));
        em.clear(); // force a real read from the database, not the JPA cache

        Task loaded = tasks.findById(saved.getId()).orElseThrow();
        assertThat(loaded.getTitle()).isEqualTo("Renew passport");
        assertThat(loaded.getTitleKey()).isEqualTo("renew passport");
        assertThat(loaded.getPriority()).isEqualTo(Priority.HIGH);
        assertThat(loaded.getDue()).isEqualTo(LocalDate.of(2026, 11, 5));
        assertThat(loaded.getCreatedAt()).isEqualTo(NOW);
        assertThat(loaded.isDone()).isFalse();
    }

    @Test
    @DisplayName("DB-02 the database itself rejects a duplicate title in another letter case")
    void uniqueConstraintIgnoresCase() {
        tasks.saveAndFlush(new Task("Buy milk", Priority.LOW, null, "qa_user", NOW));

        // Bypasses the service's duplicate check on purpose: the constraint is the safety net.
        assertThatThrownBy(() -> tasks.saveAndFlush(new Task("BUY MILK", Priority.LOW, null, "qa_user", NOW)))
            .isInstanceOf(DataIntegrityViolationException.class)
            .hasMessageContaining("uk_tasks_title_key");
    }

    @Test
    @DisplayName("DB-03 the database rejects a title longer than 40 characters")
    void columnLengthEnforced() {
        assertThatThrownBy(() -> tasks.saveAndFlush(new Task("x".repeat(41), Priority.LOW, null, "qa_user", NOW)))
            .isInstanceOf(DataAccessException.class);
    }

    @Test
    @DisplayName("DB-04 duplicate lookup by key finds titles in any letter case")
    void existsByTitleKey() {
        tasks.saveAndFlush(new Task("Pay Rent", Priority.MEDIUM, null, "qa_user", NOW));

        assertThat(tasks.existsByTitleKey(Task.keyOf("PAY RENT"))).isTrue();
        assertThat(tasks.existsByTitleKey(Task.keyOf("Pay the rent"))).isFalse();
    }

    @Test
    @DisplayName("DB-05 audit entries come back newest first, with before and after values")
    void auditOrder() {
        audit.saveAndFlush(new AuditEntry(NOW, "qa_user", "TASK_CREATED", "\"A\"", null, null));
        audit.saveAndFlush(new AuditEntry(NOW, "qa_user", "TASK_COMPLETED", "\"A\"", "Open", "Done"));
        em.clear();

        var entries = audit.findAllByOrderByIdDesc();
        assertThat(entries).extracting(AuditEntry::getAction).containsExactly("TASK_COMPLETED", "TASK_CREATED");
        assertThat(entries.get(0).getBefore()).isEqualTo("Open");
        assertThat(entries.get(0).getAfter()).isEqualTo("Done");
    }
}
