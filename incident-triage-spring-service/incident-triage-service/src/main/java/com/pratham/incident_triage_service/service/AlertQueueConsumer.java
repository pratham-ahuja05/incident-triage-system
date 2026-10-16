package com.pratham.incident_triage_service.service;

import com.pratham.incident_triage_service.dto.TriageResponse;
import com.pratham.incident_triage_service.entity.Alert;
import com.pratham.incident_triage_service.entity.TriageResult;
import com.pratham.incident_triage_service.repository.AlertRepository;
import com.pratham.incident_triage_service.repository.TriageResultRepository;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
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
    private static final int MAX_RETRIES = 3;

    @Autowired private RedisTemplate<String, String> redisTemplate;
    @Autowired private AlertRepository alertRepository;
    @Autowired private TriageResultRepository triageResultRepository;
    @Autowired private WebClient webClient;
    @Autowired private AlertQueueProducer alertQueueProducer;
    @Autowired private SseBroadcaster broadcaster;
    @Autowired private IncidentWorkflowService workflow;

    @Value("${python.service.url}")
    private String pythonServiceUrl;

    private volatile boolean running = true;

    @PostConstruct
    public void startConsumerThread() {
        Thread consumerThread = new Thread(this::consumeLoop, "alert-queue-consumer");
        consumerThread.setDaemon(true);
        consumerThread.start();
    }

    // Stop polling Redis once the context shuts down (otherwise the loop spins on a destroyed connection factory).
    @PreDestroy
    public void stopConsumerThread() {
        running = false;
    }

    private void consumeLoop() {
        while (running) {
            try {
                String alertIdStr = redisTemplate.opsForList()
                        .rightPop(QUEUE_KEY, java.time.Duration.ofSeconds(5));
                if (alertIdStr == null) continue;
                processAlert(Long.parseLong(alertIdStr));
            } catch (Exception e) {
                if (!running) break;
                System.err.println("Consumer error: " + e.getMessage());
                try {
                    Thread.sleep(2000); // back off instead of spamming the log when Redis is unavailable
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        }
    }

    private void processAlert(Long alertId) {
        Optional<Alert> optionalAlert = alertRepository.findById(alertId);
        if (optionalAlert.isEmpty()) return;

        Alert alert = optionalAlert.get();
        alert.setStatus("PROCESSING");
        alertRepository.save(alert);
        workflow.log(alertId, "PROCESSING", "system",
                "Attempt " + (alert.getRetryCount() + 1) + " picked up by a triage worker");
        broadcaster.broadcastUpdate();

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
            result.setSeverity(response.getSeverity());
            result.setCategory(response.getCategory());
            if (response.getTimingsMs() != null) {
                result.setRetrievalMs(response.getTimingsMs().get("retrieval"));
                result.setAiCheckMs(response.getTimingsMs().get("ai_check"));
                result.setClassifyMs(response.getTimingsMs().get("classify"));
            }
            triageResultRepository.save(result);

            alert.setStatus("COMPLETED");
            alert.setRetryCount(0);
            workflow.applyTriage(alert, result);
            alertRepository.save(alert);

        } catch (Exception e) {
            System.err.println("Failed to process alert " + alertId + ": " + e.getMessage());
            if (alert.getRetryCount() < MAX_RETRIES) {
                workflow.log(alertId, "ATTEMPT_FAILED", "system",
                        "Attempt " + (alert.getRetryCount() + 1) + " failed: " + summarize(e) + " — retrying with backoff");
            }
            handleFailure(alert);
        }

        broadcaster.broadcastUpdate();
    }

    private static String summarize(Exception e) {
        String msg = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
        if (msg.contains("Connection refused")) return "AI service unreachable (connection refused)";
        return msg.length() > 160 ? msg.substring(0, 160) + "…" : msg;
    }

    private void handleFailure(Alert alert) {
        int retries = alert.getRetryCount();
        if (retries < MAX_RETRIES) {
            alert.setRetryCount(retries + 1);
            alert.setStatus("PENDING");
            alertRepository.save(alert);
            scheduleRetry(alert.getId(), retries + 1);
        } else {
            alert.setStatus("FAILED"); // dead-lettered — needs manual retry
            alertRepository.save(alert);
            workflow.log(alert.getId(), "FAILED", "system",
                    "Triage failed after " + (MAX_RETRIES + 1) + " attempts — the AI service may be down");
        }
    }

    // Exponential backoff: attempt 1 -> 2s, attempt 2 -> 4s, attempt 3 -> 8s
    private void scheduleRetry(Long alertId, int attempt) {
        long backoffMillis = (long) Math.pow(2, attempt) * 1000;
        Thread retryThread = new Thread(() -> {
            try {
                Thread.sleep(backoffMillis);
                alertQueueProducer.enqueue(alertId);
            } catch (InterruptedException ignored) {
            }
        });
        retryThread.setDaemon(true);
        retryThread.start();
    }
}