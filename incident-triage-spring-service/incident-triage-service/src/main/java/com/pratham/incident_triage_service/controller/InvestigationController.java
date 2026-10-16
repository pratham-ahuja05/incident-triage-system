package com.pratham.incident_triage_service.controller;

import com.pratham.incident_triage_service.entity.Alert;
import com.pratham.incident_triage_service.repository.AlertRepository;
import com.pratham.incident_triage_service.service.IncidentWorkflowService;
import com.pratham.incident_triage_service.service.SseBroadcaster;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientRequestException;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.*;

// AI investigation (stored per incident) and possible-duplicate detection.
@RestController
@RequestMapping("/api/alerts")
public class InvestigationController {

    private static final Duration DUPLICATE_WINDOW = Duration.ofDays(7);

    private final AlertRepository alertRepository;
    private final IncidentWorkflowService workflow;
    private final SseBroadcaster broadcaster;
    private final WebClient webClient;

    @Value("${python.service.url}")
    private String pythonServiceUrl;

    public InvestigationController(AlertRepository alertRepository, IncidentWorkflowService workflow,
                                   SseBroadcaster broadcaster, WebClient webClient) {
        this.alertRepository = alertRepository;
        this.workflow = workflow;
        this.broadcaster = broadcaster;
        this.webClient = webClient;
    }

    // Runs (or re-runs) the AI investigation and stores the structured result on the incident.
    @PostMapping("/{id}/investigation")
    public ResponseEntity<?> investigate(@PathVariable Long id) {
        Optional<Alert> optionalAlert = alertRepository.findByIdAndDeletedFalse(id);
        if (optionalAlert.isEmpty()) return ResponseEntity.notFound().build();
        Alert alert = optionalAlert.get();

        String json;
        try {
            json = webClient.post()
                    .uri(pythonServiceUrl + "/investigate")
                    .bodyValue(Map.of("log_message", alert.getMessage(), "source", alert.getSource()))
                    .retrieve()
                    .bodyToMono(String.class)
                    .timeout(Duration.ofSeconds(45))
                    .block();
        } catch (WebClientResponseException e) {
            // Pass the AI service's own explanation through (rate limited / provider down / bad output)
            int status = e.getStatusCode().value() == 429 ? 429 : e.getStatusCode().is5xxServerError() ? 503 : 502;
            return ResponseEntity.status(status).body(Map.of("message", detailOf(e)));
        } catch (WebClientRequestException e) {
            return ResponseEntity.status(503).body(Map.of("message", "The AI service is unreachable. Check that it is running, then try again."));
        } catch (Exception e) {
            return ResponseEntity.status(504).body(Map.of("message", "The AI investigation timed out. Try again."));
        }

        alert.setInvestigation(json);
        alert.setInvestigatedAt(LocalDateTime.now());
        alertRepository.save(alert);
        workflow.log(id, "INVESTIGATED", IncidentWorkflowService.currentUser(), "Ran an AI investigation");
        broadcaster.broadcastUpdate();
        return ResponseEntity.ok(Map.of("investigation", json, "investigatedAt", alert.getInvestigatedAt().toString()));
    }

    private static String detailOf(WebClientResponseException e) {
        String body = e.getResponseBodyAsString();
        int i = body.indexOf("\"detail\":\"");
        if (i >= 0) {
            int start = i + 10;
            int end = body.indexOf('"', start);
            if (end > start) return body.substring(start, end);
        }
        return "The AI service returned an error (" + e.getStatusCode().value() + ").";
    }

    // Possible duplicates: other incidents from the same service whose message has the same shape once
    // numbers, hex IDs and hostnames-with-digits are masked, reported within 7 days. A heuristic, labelled as such.
    @GetMapping("/{id}/duplicates")
    public ResponseEntity<?> possibleDuplicates(@PathVariable Long id) {
        Optional<Alert> optionalAlert = alertRepository.findByIdAndDeletedFalse(id);
        if (optionalAlert.isEmpty()) return ResponseEntity.notFound().build();
        Alert alert = optionalAlert.get();
        String pattern = normalize(alert.getMessage());

        List<Map<String, Object>> matches = alertRepository.findAll().stream()
                .filter(a -> !a.isDeleted() && !a.getId().equals(id))
                .filter(a -> a.getSource().equalsIgnoreCase(alert.getSource()))
                .filter(a -> Duration.between(a.getCreatedAt(), alert.getCreatedAt()).abs().compareTo(DUPLICATE_WINDOW) <= 0)
                .filter(a -> normalize(a.getMessage()).equals(pattern))
                .sorted(Comparator.comparing(Alert::getCreatedAt))
                .limit(10)
                .map(a -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", a.getId());
                    m.put("message", a.getMessage());
                    m.put("createdAt", a.getCreatedAt());
                    m.put("ticketStatus", a.getTicketStatus());
                    m.put("assignee", a.getAssignee());
                    return m;
                })
                .toList();
        return ResponseEntity.ok(matches);
    }

    static String normalize(String message) {
        return message.toLowerCase()
                .replaceAll("0x[0-9a-f]+", "#")
                .replaceAll("[0-9a-f]{8,}", "#")
                .replaceAll("\\d+", "#")
                .replaceAll("\\s+", " ")
                .trim();
    }
}
