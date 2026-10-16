package com.pratham.incident_triage_service.controller;

import com.pratham.incident_triage_service.entity.Alert;
import com.pratham.incident_triage_service.entity.TriageResult;
import com.pratham.incident_triage_service.repository.AlertRepository;
import com.pratham.incident_triage_service.repository.TriageResultRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/analytics")
public class AnalyticsController {

    @Autowired private AlertRepository alertRepository;
    @Autowired private TriageResultRepository triageResultRepository;

    @GetMapping
    public Map<String, Object> getAnalytics() {
        List<Alert> alerts = alertRepository.findAll();
        List<TriageResult> results = triageResultRepository.findAll();

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("totalAlerts", alerts.size());
        data.put("autoFixed", results.stream().filter(r -> "auto_suggest_fix".equals(r.getDecision())).count());
        data.put("escalated", results.stream().filter(r -> "escalate".equals(r.getDecision())).count());
        data.put("failed", alerts.stream().filter(a -> "FAILED".equals(a.getStatus())).count());
        data.put("pending", alerts.stream().filter(a -> List.of("PENDING", "PROCESSING").contains(a.getStatus())).count());

        OptionalDouble avgDistance = results.stream()
                .filter(r -> r.getConfidenceDistance() != null)
                .mapToDouble(TriageResult::getConfidenceDistance)
                .average();
        data.put("avgConfidenceDistance", avgDistance.isPresent() ? Math.round(avgDistance.getAsDouble() * 1000.0) / 1000.0 : null);

        data.put("byCategory", results.stream()
                .filter(r -> r.getCategory() != null)
                .collect(Collectors.groupingBy(TriageResult::getCategory, Collectors.counting())));

        data.put("bySeverity", results.stream()
                .filter(r -> r.getSeverity() != null)
                .collect(Collectors.groupingBy(TriageResult::getSeverity, Collectors.counting())));

        // Ticket workflow: status mix, SLA breaches, mean time to resolve
        List<Alert> active = alerts.stream().filter(a -> !a.isDeleted()).toList();
        java.time.LocalDateTime now = java.time.LocalDateTime.now();
        data.put("byTicketStatus", active.stream()
                .collect(Collectors.groupingBy(a -> a.getTicketStatus() == null ? "OPEN" : a.getTicketStatus(), Collectors.counting())));
        data.put("byPriority", active.stream().filter(a -> a.getPriority() != null)
                .collect(Collectors.groupingBy(Alert::getPriority, Collectors.counting())));
        data.put("overdue", active.stream()
                .filter(a -> a.getDueAt() != null && a.getResolvedAt() == null && a.getDueAt().isBefore(now)).count());
        OptionalDouble mttr = active.stream()
                .filter(a -> a.getResolvedAt() != null)
                .mapToDouble(a -> java.time.Duration.between(a.getCreatedAt(), a.getResolvedAt()).toMinutes() / 60.0)
                .average();
        data.put("mttrHours", mttr.isPresent() ? Math.round(mttr.getAsDouble() * 10.0) / 10.0 : null);

        data.put("byReviewStatus", results.stream()
                .collect(Collectors.groupingBy(TriageResult::getHumanReviewStatus, Collectors.counting())));

        return data;
    }
}