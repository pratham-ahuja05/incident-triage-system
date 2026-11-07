package com.pratham.incident_triage_service.config;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class RateLimitConfig {

    @Value("${app.rate-limit.enabled:true}")
    private boolean enabled;

    // Sustained alerts per minute per client; the bucket also allows a burst of this size.
    @Value("${app.rate-limit.per-minute:60}")
    private long perMinute;

    // One bucket per client (authenticated user), so one noisy sender cannot starve everyone else.
    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    public boolean tryConsume(String clientKey) {
        if (!enabled) return true;
        return buckets.computeIfAbsent(clientKey, k -> newBucket()).tryConsume(1);
    }

    private Bucket newBucket() {
        Bandwidth limit = Bandwidth.builder()
                .capacity(perMinute)
                .refillGreedy(perMinute, Duration.ofMinutes(1))
                .build();
        return Bucket.builder().addLimit(limit).build();
    }
}
