package com.qalab.tasklab.api.task;

import org.springframework.data.jpa.repository.JpaRepository;

public interface TaskRepository extends JpaRepository<Task, Long> {

    boolean existsByTitleKey(String titleKey);
}
