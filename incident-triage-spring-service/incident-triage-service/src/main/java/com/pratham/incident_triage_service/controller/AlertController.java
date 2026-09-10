package com.pratham.incident_triage_service.controller;

import java.util.List;
import java.util.ArrayList;
import com.pratham.incident_triage_service.dto.AlertRequest;
import com.pratham.incident_triage_service.dto.AlertWithResult;
import com.pratham.incident_triage_service.entity.Alert;
import com.pratham.incident_triage_service.entity.TriageResult;
import com.pratham.incident_triage_service.repository.AlertRepository;
import com.pratham.incident_triage_service.repository.TriageResultRepository;
import com.pratham.incident_triage_service.service.AlertQueueProducer;
import com.pratham.incident_triage_service.config.RateLimitConfig;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import io.github.bucket4j.Bucket;

@CrossOrigin(origins = "http://localhost:5173")
@RestController
@RequestMapping("/api/alerts")
public class AlertController {

    @Autowired
    private AlertRepository alertRepository;

    @Autowired
    private AlertQueueProducer alertQueueProducer;

    @Autowired
    private TriageResultRepository triageResultRepository;

    private final Bucket rateLimitBucket;

    // Constructor injection for the rate limit bucket — created once when the controller is built
    public AlertController(RateLimitConfig rateLimitConfig) {
        this.rateLimitBucket = rateLimitConfig.createNewBucket();
    }

    @PostMapping
    public ResponseEntity<?> ingestAlert(@Valid @RequestBody AlertRequest request) {
        if (!rateLimitBucket.tryConsume(1)) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body("Rate limit exceeded. Please slow down.");
        }

        Alert alert = new Alert();
        alert.setSource(request.getSource());
        alert.setMessage(request.getMessage());
        Alert saved = alertRepository.save(alert);

        alertQueueProducer.enqueue(saved.getId());

        return ResponseEntity.status(HttpStatus.ACCEPTED).body(saved);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Alert> getAlert(@PathVariable Long id) {
        return alertRepository.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping
    public ResponseEntity<List<AlertWithResult>> getAllAlerts() {
        List<Alert> alerts = alertRepository.findAll();
        List<AlertWithResult> combined = new ArrayList<>();

        for (Alert alert : alerts) {
            TriageResult result = triageResultRepository.findAll().stream()
                    .filter(r -> r.getAlertId().equals(alert.getId()))
                    .findFirst()
                    .orElse(null);

            combined.add(new AlertWithResult(
                    alert.getId(),
                    alert.getSource(),
                    alert.getMessage(),
                    alert.getStatus(),
                    alert.getCreatedAt(),
                    result != null ? result.getDecision() : null,
                    result != null ? result.getSuggestedResolution() : null,
                    result != null ? result.getReasoning() : null,
                    result != null ? result.getConfidenceDistance() : null
            ));
        }

        return ResponseEntity.ok(combined);
    }
}