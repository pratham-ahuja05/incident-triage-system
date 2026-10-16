package com.pratham.incident_triage_service.controller;

import com.pratham.incident_triage_service.entity.Alert;
import com.pratham.incident_triage_service.entity.TriageResult;
import com.pratham.incident_triage_service.repository.AlertRepository;
import com.pratham.incident_triage_service.repository.TriageResultRepository;
import com.pratham.incident_triage_service.service.SseBroadcaster;
import com.pratham.incident_triage_service.service.IncidentWorkflowService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/triage-results")
public class TriageResultController {

    @Autowired private TriageResultRepository triageResultRepository;
    @Autowired private AlertRepository alertRepository;
    @Autowired private WebClient webClient;
    @Autowired private SseBroadcaster broadcaster;
    @Autowired private IncidentWorkflowService workflow;

    @Value("${python.service.url}")
    private String pythonServiceUrl;

    @PostMapping("/{id}/review")
public ResponseEntity<?> reviewDecision(@PathVariable Long id, @RequestParam String decision) {
    if (!decision.equals("APPROVED") && !decision.equals("REJECTED")) {
        return ResponseEntity.badRequest().body("decision must be APPROVED or REJECTED");
    }
    Optional<TriageResult> optionalResult = triageResultRepository.findById(id);
    if (optionalResult.isEmpty()) return ResponseEntity.notFound().build();

    TriageResult result = optionalResult.get();
    result.setHumanReviewStatus(decision);
    triageResultRepository.save(result);

    String actor = IncidentWorkflowService.currentUser();
    alertRepository.findById(result.getAlertId()).ifPresent(a -> {
        workflow.log(a.getId(), "REVIEW", actor,
                decision.equals("APPROVED") ? "Approved the suggested fix" : "Rejected the suggested fix");
        // Approved fix = incident handled. Rejected = a person has to work it.
        workflow.transition(a, decision.equals("APPROVED") ? "RESOLVED" : "IN_PROGRESS", actor);
        alertRepository.save(a);
    });

    // If approved, feed this proven fix back into the knowledge base
    if (decision.equals("APPROVED") && "auto_suggest_fix".equals(result.getDecision())) {
        Optional<Alert> optionalAlert = alertRepository.findById(result.getAlertId());
        if (optionalAlert.isPresent()) {
            try {
                Map<String, String> learnRequest = new HashMap<>();
                learnRequest.put("log_message", optionalAlert.get().getMessage());
                learnRequest.put("resolution", result.getSuggestedResolution());
                learnRequest.put("severity", result.getSeverity() != null ? result.getSeverity() : "unknown");
                learnRequest.put("category", result.getCategory() != null ? result.getCategory() : "unknown");

                webClient.post()
                        .uri(pythonServiceUrl + "/incidents/learn")
                        .bodyValue(learnRequest)
                        .retrieve()
                        .toBodilessEntity()
                        .block();
            } catch (Exception e) {
                System.err.println("Failed to add approved fix to knowledge base: " + e.getMessage());
                // don't fail the review action just because the learn-call failed
            }
        }
    }

    broadcaster.broadcastUpdate();
    return ResponseEntity.ok(result);
}

    // Feature 1 — feedback loop
    @PostMapping("/{id}/resolve")
    public ResponseEntity<?> resolveAndLearn(@PathVariable Long id, @RequestBody Map<String, String> body) {
        String resolutionNote = body.get("resolutionNote");
        if (resolutionNote == null || resolutionNote.isBlank()) {
            return ResponseEntity.badRequest().body("resolutionNote is required");
        }

        Optional<TriageResult> optionalResult = triageResultRepository.findById(id);
        if (optionalResult.isEmpty()) return ResponseEntity.notFound().build();
        TriageResult result = optionalResult.get();

        Optional<Alert> optionalAlert = alertRepository.findById(result.getAlertId());
        if (optionalAlert.isEmpty()) return ResponseEntity.notFound().build();
        Alert alert = optionalAlert.get();

        try {
            Map<String, String> learnRequest = new HashMap<>();
            learnRequest.put("log_message", alert.getMessage());
            learnRequest.put("resolution", resolutionNote);
            learnRequest.put("severity", result.getSeverity() != null ? result.getSeverity() : "unknown");
            learnRequest.put("category", result.getCategory() != null ? result.getCategory() : "unknown");

            webClient.post()
                    .uri(pythonServiceUrl + "/incidents/learn")
                    .bodyValue(learnRequest)
                    .retrieve()
                    .toBodilessEntity()
                    .block();

            result.setHumanReviewStatus("RESOLVED");
            result.setHumanResolutionNote(resolutionNote);
            triageResultRepository.save(result);

            String actor = IncidentWorkflowService.currentUser();
            workflow.log(alert.getId(), "RESOLVED", actor, resolutionNote);
            workflow.transition(alert, "RESOLVED", actor);
            alertRepository.save(alert);
            broadcaster.broadcastUpdate();

            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.status(502).body("Failed to teach knowledge base: " + e.getMessage());
        }
    }
}