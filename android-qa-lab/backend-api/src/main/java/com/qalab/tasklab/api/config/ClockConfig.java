package com.qalab.tasklab.api.config;

import java.time.Clock;
import java.time.ZoneId;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * All "now" and "today" values come from this Clock. Tests replace it with a fixed clock,
 * so "overdue" never depends on the day the tests run.
 */
@Configuration
public class ClockConfig {

    @Bean
    public Clock clock(@Value("${tasklab.time-zone:UTC}") String zone) {
        return Clock.system(ZoneId.of(zone));
    }
}
