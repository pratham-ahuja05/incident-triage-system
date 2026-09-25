package com.pratham.incident_triage_service.controller;

import java.util.List;
import java.util.ArrayList;
import java.util.Optional;
import com.pratham.incident_triage_service.dto.AlertRequest;
import com.pratham.incident_triage_service.dto.AlertWithResult;
import com.pratham.incident_triage_service.dto.MarkDuplicateRequest;
import com.pratham.incident_triage_service.entity.Alert;
import com.pratham.incident_triage_service.entity.TriageResult;
import com.pratham.incident_triage_service.repository.AlertRepository;
import com.pratham.incident_triage_service.repository.TriageResultRepository;
import com.pratham.incident_triage_service.service.AlertQueueProducer;
import com.pratham.incident_triage_service.service.SseBroadcaster;
import com.pratham.incident_triage_service.config.RateLimitConfig;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import io.github.bucket4j.Bucket;

@CrossOrigin(origins = "http://localhost:5173")
@RestController
@RequestMapping("/api/alerts")
public class AlertController {

    @Autowired private AlertRepository alertRepository;
    @Autowired private AlertQueueProducer alertQueueProducer;
    @Autowired private TriageResultRepository triageResultRepository;
    @Autowired private SseBroadcaster broadcaster;

    private final Bucket rateLimitBucket;

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
        broadcaster.broadcastUpdate();

        return ResponseEntity.status(HttpStatus.ACCEPTED).body(saved);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Alert> getAlert(@PathVariable Long id) {
        return alertRepository.findByIdAndDeletedFalse(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping
    public ResponseEntity<List<AlertWithResult>> getAllAlerts() {
        List<Alert> alerts = alertRepository.findAll().stream()
                .filter(a -> !a.isDeleted())
                .toList();
        List<AlertWithResult> combined = new ArrayList<>();

        for (Alert alert : alerts) {
            TriageResult result = triageResultRepository.findAll().stream()
                    .filter(r -> r.getAlertId().equals(alert.getId()))
                    .findFirst()
                    .orElse(null);

            combined.add(new AlertWithResult(
                    alert.getId(), alert.getSource(), alert.getMessage(), alert.getStatus(),
                    alert.getRetryCount(), alert.getCreatedAt(),
                    result != null ? result.getId() : null,
                    result != null ? result.getDecision() : null,
                    result != null ? result.getSuggestedResolution() : null,
                    result != null ? result.getReasoning() : null,
                    result != null ? result.getConfidenceDistance() : null,
                    result != null ? result.getHumanReviewStatus() : null,
                    result != null ? result.getHumanResolutionNote() : null,
                    result != null ? result.getMatchedIncidentId() : null,
                    result != null ? result.getMatchedLog() : null,
                    result != null ? result.getSeverity() : null,
                    result != null ? result.getCategory() : null
            ));
        }
        return ResponseEntity.ok(combined);
    }

    // Full-text/multi-field search — mirrors Issue Management System's /issues/search
    @GetMapping("/search")
    public ResponseEntity<Page<Alert>> searchAlerts(
            @RequestParam String query,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size
    ) {
        Pageable pageable = PageRequest.of(page, size);
        return ResponseEntity.ok(alertRepository.searchActiveAlerts(query, status, pageable));
    }

    @PostMapping("/{id}/retry")
    public ResponseEntity<?> retryAlert(@PathVariable Long id) {
        Optional<Alert> optionalAlert = alertRepository.findByIdAndDeletedFalse(id);
        if (optionalAlert.isEmpty()) return ResponseEntity.notFound().build();

        Alert alert = optionalAlert.get();
        alert.setRetryCount(0);
        alert.setStatus("PENDING");
        alertRepository.save(alert);
        alertQueueProducer.enqueue(id);
        broadcaster.broadcastUpdate();

        return ResponseEntity.ok(alert);
    }

    // Soft-delete — mirrors Issue Management System's DELETE /issues/{id}
    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteAlert(@PathVariable Long id) {
        Optional<Alert> optionalAlert = alertRepository.findByIdAndDeletedFalse(id);
        if (optionalAlert.isEmpty()) return ResponseEntity.notFound().build();

        Alert alert = optionalAlert.get();
        alert.setDeleted(true);
        alertRepository.save(alert);
        broadcaster.broadcastUpdate();

        return ResponseEntity.noContent().build();
    }

    // Restore — mirrors Issue Management System's PUT /issues/{id}/restore
    @PutMapping("/{id}/restore")
    public ResponseEntity<?> restoreAlert(@PathVariable Long id) {
        Optional<Alert> optionalAlert = alertRepository.findByIdAndDeletedTrue(id);
        if (optionalAlert.isEmpty()) return ResponseEntity.notFound().build();

        Alert alert = optionalAlert.get();
        alert.setDeleted(false);
        Alert saved = alertRepository.save(alert);
        broadcaster.broadcastUpdate();

        return ResponseEntity.ok(saved);
    }

    // Self-referencing many-to-many duplicate linking — mirrors Issue Management System
    @PostMapping("/{id}/mark-duplicate")
    public ResponseEntity<?> markDuplicate(@PathVariable Long id, @RequestBody MarkDuplicateRequest request) {
        Optional<Alert> optionalAlert = alertRepository.findByIdWithDuplicates(id);
        if (optionalAlert.isEmpty()) return ResponseEntity.notFound().build();

        Optional<Alert> optionalDup = alertRepository.findById(request.getDuplicateId());
        if (optionalDup.isEmpty()) return ResponseEntity.notFound().build();

        Alert alert = optionalAlert.get();
        alert.getDuplicates().add(optionalDup.get());
        alert.setStatus("POSSIBLE_DUPLICATE");

        Alert saved = alertRepository.save(alert);
        broadcaster.broadcastUpdate();

        return ResponseEntity.ok(saved);
    }

    @GetMapping("/stream")
    public SseEmitter stream() {
        return broadcaster.subscribe();
    }
}