package com.qalab.tasklab.api.support;

import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;

/**
 * One real PostgreSQL, started in Docker by Testcontainers and shared by every integration
 * test class that imports it with @ImportTestcontainers(PostgresContainer.class).
 * @ServiceConnection points Spring's datasource at it automatically.
 */
public interface PostgresContainer {

    @Container
    @ServiceConnection
    PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");
}
