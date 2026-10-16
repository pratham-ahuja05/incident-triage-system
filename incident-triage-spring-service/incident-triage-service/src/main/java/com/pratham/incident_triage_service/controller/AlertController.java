package com.pratham.incident_triage_service.controller;

import java.util.List;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.ArrayList;
import java.util.Optional;
import com.pratham.incident_triage_service.dto.AlertRequest;
import com.pratham.incident_triage_service.dto.AlertWithResult;
import com.pratham.incident_triage_service.dto.MarkDuplicateRequest;
import com.pratham.incident_triage_service.entity.Alert;
import com.pratham.incident_triage_service.entity.TriageResult;
import com.pratham.incident_triage_service.repository.AlertRepository;
import com.pratham.incident_triage_service.repository.TriageResultRepository;
import com.pratham.incident_triage_service.repository.IncidentEventRepository;
import com.pratham.incident_triage_service.service.IncidentWorkflowService;
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

@RestController
@RequestMapping("/api/alerts")
public class AlertController {

    @Autowired private AlertRepository alertRepository;
    @Autowired private AlertQueueProducer alertQueueProducer;
    @Autowired private TriageResultRepository triageResultRepository;
    @Autowired private SseBroadcaster broadcaster;
    @Autowired private IncidentEventRepository eventRepository;
    @Autowired private IncidentWorkflowService workflow;

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
        alert.setReporter(IncidentWorkflowService.currentUser());
        Alert saved = alertRepository.save(alert);
        workflow.log(saved.getId(), "CREATED", saved.getReporter(), "Reported from " + saved.getSource());

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
        // Load triage results once and index by alert id (was one findAll() per alert).
        Map<Long, TriageResult> resultsByAlert = triageResultRepository.findAll().stream()
                .collect(Collectors.toMap(TriageResult::getAlertId, Function.identity(), (first, second) -> first));
        Map<Long, Long> commentCounts = new HashMap<>();
        for (Object[] row : eventRepository.countCommentsByAlert()) {
            commentCounts.put((Long) row[0], (Long) row[1]);
        }
        List<AlertWithResult> combined = new ArrayList<>();
        for (Alert alert : alerts) {
            combined.add(AlertWithResult.of(alert, resultsByAlert.get(alert.getId()),
                    commentCounts.getOrDefault(alert.getId(), 0L)));
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
        workflow.log(id, "RETRY", IncidentWorkflowService.currentUser(), "Triage re-queued");
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
        workflow.log(id, "DELETED", IncidentWorkflowService.currentUser(), "Incident deleted");
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

        if (request.getDuplicateId() == null || request.getDuplicateId().equals(id)) {
            return ResponseEntity.badRequest().body("duplicateId must be another incident");
        }
        Optional<Alert> optionalDup = alertRepository.findByIdAndDeletedFalse(request.getDuplicateId());
        if (optionalDup.isEmpty()) return ResponseEntity.notFound().build();

        // `id` is the duplicate; `duplicateId` is the original it duplicates.
        // The processing status is left alone so the triage pipeline still reads correctly.
        Alert alert = optionalAlert.get();
        Alert original = optionalDup.get();
        String actor = IncidentWorkflowService.currentUser();
        alert.getDuplicates().add(original);
        alert.setDuplicateOfId(original.getId());
        workflow.transition(alert, "CLOSED", actor);
        workflow.log(id, "DUPLICATE", actor, "Closed as a duplicate of INC-" + original.getId());
        workflow.log(original.getId(), "DUPLICATE", actor, "INC-" + id + " was closed as a duplicate of this incident");
        alertRepository.save(alert);
        broadcaster.broadcastUpdate();

        return ResponseEntity.ok(Map.of("id", id, "duplicateOfId", original.getId(), "ticketStatus", alert.getTicketStatus()));
    }

    @GetMapping("/stream")
    public SseEmitter stream() {
        return broadcaster.subscribe();
    }
}