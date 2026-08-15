package com.pratham.incident_triage_service.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

@Service
public class AlertQueueProducer {

    private static final String QUEUE_KEY = "alert_queue";

    @Autowired
    private RedisTemplate<String, String> redisTemplate;

    public void enqueue(Long alertId) {
        redisTemplate.opsForList().leftPush(QUEUE_KEY, alertId.toString());
    }
}