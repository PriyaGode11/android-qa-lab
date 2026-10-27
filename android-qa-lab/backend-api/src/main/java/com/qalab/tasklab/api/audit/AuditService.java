package com.qalab.tasklab.api.audit;

import java.time.Clock;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuditService {

    public record AuditResponse(Long id, String occurredAt, String user, String action, String details, String before, String after) {
    }

    private final AuditRepository repository;
    private final Clock clock;

    public AuditService(AuditRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    @Transactional
    public void record(String user, String action, String details) {
        record(user, action, details, null, null);
    }

    @Transactional
    public void record(String user, String action, String details, String before, String after) {
        repository.save(new AuditEntry(clock.instant(), user, action, details, before, after));
    }

    /** Newest first; optionally only one action. */
    @Transactional(readOnly = true)
    public List<AuditResponse> list(String action) {
        List<AuditEntry> entries = action == null || action.isBlank()
            ? repository.findAllByOrderByIdDesc()
            : repository.findByActionOrderByIdDesc(action.strip());
        return entries.stream()
            .map(e -> new AuditResponse(e.getId(), e.getOccurredAt().toString(), e.getUsername(), e.getAction(),
                e.getDetails(), e.getBefore(), e.getAfter()))
            .toList();
    }
}
