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
@CrossOrigin(origins = "http://localhost:5173")
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

        data.put("byReviewStatus", results.stream()
                .collect(Collectors.groupingBy(TriageResult::getHumanReviewStatus, Collectors.counting())));

        return data;
    }
}