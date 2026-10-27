package com.qalab.tasklab.api.audit;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** One recorded change. Entries are only ever inserted, never updated or deleted by the API. */
@Entity
@Table(name = "audit_entries")
public class AuditEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    @Column(name = "username", nullable = false, length = 50)
    private String username;

    @Column(nullable = false, length = 40)
    private String action;

    @Column(nullable = false, length = 500)
    private String details;

    @Column(name = "value_before", length = 20)
    private String before;

    @Column(name = "value_after", length = 20)
    private String after;

    protected AuditEntry() {
        // for JPA
    }

    public AuditEntry(Instant occurredAt, String username, String action, String details, String before, String after) {
        this.occurredAt = occurredAt;
        this.username = username;
        this.action = action;
        this.details = details;
        this.before = before;
        this.after = after;
    }

    public Long getId() { return id; }
    public Instant getOccurredAt() { return occurredAt; }
    public String getUsername() { return username; }
    public String getAction() { return action; }
    public String getDetails() { return details; }
    public String getBefore() { return before; }
    public String getAfter() { return after; }
}
