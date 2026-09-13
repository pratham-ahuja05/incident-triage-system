package com.pratham.incident_triage_service.service;

import com.pratham.incident_triage_service.dto.TriageResponse;
import com.pratham.incident_triage_service.entity.Alert;
import com.pratham.incident_triage_service.entity.TriageResult;
import com.pratham.incident_triage_service.repository.AlertRepository;
import com.pratham.incident_triage_service.repository.TriageResultRepository;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

@Service
public class AlertQueueConsumer {

    private static final String QUEUE_KEY = "alert_queue";

    @Autowired
    private RedisTemplate<String, String> redisTemplate;

    @Autowired
    private AlertRepository alertRepository;

    @Autowired
    private TriageResultRepository triageResultRepository;

    @Autowired
    private WebClient webClient;

    @Value("${python.service.url}")
    private String pythonServiceUrl;

    @PostConstruct
    public void startConsumerThread() {
        Thread consumerThread = new Thread(this::consumeLoop);
        consumerThread.setDaemon(true);
        consumerThread.start();
    }

    private void consumeLoop() {
        while (true) {
            try {
                String alertIdStr = redisTemplate.opsForList()
                        .rightPop(QUEUE_KEY, java.time.Duration.ofSeconds(5));

                if (alertIdStr == null) continue;

                Long alertId = Long.parseLong(alertIdStr);
                processAlert(alertId);

            } catch (Exception e) {
                System.err.println("Consumer error: " + e.getMessage());
            }
        }
    }

    private void processAlert(Long alertId) {
    Optional<Alert> optionalAlert = alertRepository.findById(alertId);
    if (optionalAlert.isEmpty()) return;

    Alert alert = optionalAlert.get();
    alert.setStatus("PROCESSING");
    alertRepository.save(alert);

    try {
        Map<String, String> requestBody = new HashMap<>();
        requestBody.put("log_message", alert.getMessage());

        TriageResponse response = webClient.post()
                .uri(pythonServiceUrl + "/triage")
                .bodyValue(requestBody)
                .retrieve()
                .bodyToMono(TriageResponse.class)
                .block();

        TriageResult result = new TriageResult();
        result.setAlertId(alertId);
        result.setDecision(response.getDecision());
        result.setSuggestedResolution(response.getSuggestedResolution());
        result.setReasoning(response.getReasoning());
        result.setConfidenceDistance(response.getConfidenceDistance());
        result.setMatchedIncidentId(response.getMatchedIncidentId());
        result.setMatchedLog(response.getMatchedLog());
        triageResultRepository.save(result);

        alert.setStatus("COMPLETED");
        alertRepository.save(alert);

    } catch (Exception e) {
        System.err.println("Failed to process alert " + alertId + ": " + e.getMessage());
        alert.setStatus("FAILED");
        alertRepository.save(alert);
    }
}
}