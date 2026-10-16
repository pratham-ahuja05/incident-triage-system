package com.pratham.incident_triage_service.service;

import com.pratham.incident_triage_service.entity.Alert;
import com.pratham.incident_triage_service.entity.IncidentEvent;
import com.pratham.incident_triage_service.entity.TriageResult;
import com.pratham.incident_triage_service.repository.AlertRepository;
import com.pratham.incident_triage_service.repository.IncidentEventRepository;
import com.pratham.incident_triage_service.repository.TriageResultRepository;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;

// Ticket workflow rules (status, priority, SLA) and the activity log, in one place.
@Service
public class IncidentWorkflowService {

    public static final List<String> TICKET_STATUSES = List.of("OPEN", "IN_PROGRESS", "IN_REVIEW", "RESOLVED", "CLOSED");
    public static final Set<String> PRIORITIES = Set.of("P1", "P2", "P3", "P4");

    // SLA: time to resolve per priority
    private static final Map<String, Duration> SLA = Map.of(
            "P1", Duration.ofHours(4),
            "P2", Duration.ofHours(24),
            "P3", Duration.ofDays(3),
            "P4", Duration.ofDays(7));

    private static final Map<String, String> SEVERITY_TO_PRIORITY = Map.of(
            "critical", "P1",
            "high", "P2",
            "medium", "P3",
            "low", "P4");

    private final IncidentEventRepository eventRepository;
    private final AlertRepository alertRepository;
    private final TriageResultRepository triageResultRepository;

    public IncidentWorkflowService(IncidentEventRepository eventRepository, AlertRepository alertRepository,
                                   TriageResultRepository triageResultRepository) {
        this.eventRepository = eventRepository;
        this.alertRepository = alertRepository;
        this.triageResultRepository = triageResultRepository;
    }

    public static String currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null && auth.isAuthenticated() && !"anonymousUser".equals(auth.getName()) ? auth.getName() : "system";
    }

    public void log(Long alertId, String type, String actor, String message) {
        eventRepository.save(new IncidentEvent(alertId, type, actor, message));
    }

    public static LocalDateTime dueFor(String priority, LocalDateTime from) {
        Duration sla = SLA.get(priority);
        return sla == null ? null : from.plus(sla);
    }

    // After the AI decides: default the priority from severity and start the SLA clock.
    public void applyTriage(Alert alert, TriageResult result) {
        if (alert.getPriority() == null) {
            String severity = result.getSeverity() == null ? "" : result.getSeverity().toLowerCase();
            alert.setPriority(SEVERITY_TO_PRIORITY.getOrDefault(severity, "P3"));
        }
        if (alert.getDueAt() == null) {
            alert.setDueAt(dueFor(alert.getPriority(), alert.getCreatedAt()));
        }
        String decision = "auto_suggest_fix".equals(result.getDecision()) ? "suggested a known fix" : "escalated it for an engineer";
        log(alert.getId(), "TRIAGED", "system",
                "AI " + decision + " · priority " + alert.getPriority()
                        + (result.getSeverity() != null ? " (severity " + result.getSeverity() + ")" : ""));
    }

    public void transition(Alert alert, String newStatus, String actor) {
        String old = alert.getTicketStatus();
        if (newStatus.equals(old)) return;
        alert.setTicketStatus(newStatus);
        if ("RESOLVED".equals(newStatus) || "CLOSED".equals(newStatus)) {
            if (alert.getResolvedAt() == null) alert.setResolvedAt(LocalDateTime.now());
        } else {
            alert.setResolvedAt(null);
        }
        log(alert.getId(), "STATUS", actor, (old == null ? "OPEN" : old) + " → " + newStatus);
    }

    // One-time fill for incidents created before the workflow existed.
    public void backfill() {
        Map<Long, TriageResult> results = new java.util.HashMap<>();
        triageResultRepository.findAll().forEach(r -> results.putIfAbsent(r.getAlertId(), r));
        for (Alert alert : alertRepository.findAll()) {
            boolean changed = false;
            if (alert.getTicketStatus() == null) {
                alert.setTicketStatus("OPEN");
                changed = true;
            }
            TriageResult result = results.get(alert.getId());
            if (result != null && alert.getPriority() == null) {
                String severity = result.getSeverity() == null ? "" : result.getSeverity().toLowerCase();
                alert.setPriority(SEVERITY_TO_PRIORITY.getOrDefault(severity, "P3"));
                alert.setDueAt(dueFor(alert.getPriority(), alert.getCreatedAt()));
                String review = result.getHumanReviewStatus();
                if (("APPROVED".equals(review) || "RESOLVED".equals(review)) && "OPEN".equals(alert.getTicketStatus())) {
                    alert.setTicketStatus("RESOLVED");
                    alert.setResolvedAt(result.getCreatedAt());
                }
                changed = true;
            }
            if (changed) alertRepository.save(alert);
        }
    }
}
