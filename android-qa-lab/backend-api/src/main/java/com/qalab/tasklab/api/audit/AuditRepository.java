package com.qalab.tasklab.api.audit;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface AuditRepository extends JpaRepository<AuditEntry, Long> {

    List<AuditEntry> findAllByOrderByIdDesc();

    List<AuditEntry> findByActionOrderByIdDesc(String action);
}
