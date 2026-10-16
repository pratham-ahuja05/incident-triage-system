package com.pratham.incident_triage_service.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

@Service
public class AlertQueueProducer {

    // Configurable so separate environments sharing one Redis do not steal each other's work
    @Value("${app.queue-key:alert_queue}")
    private String QUEUE_KEY;

    @Autowired
    private RedisTemplate<String, String> redisTemplate;

    public void enqueue(Long alertId) {
        redisTemplate.opsForList().leftPush(QUEUE_KEY, alertId.toString());
    }
}