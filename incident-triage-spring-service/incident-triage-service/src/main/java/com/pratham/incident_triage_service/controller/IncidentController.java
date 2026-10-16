package com.pratham.incident_triage_service.controller;

import com.pratham.incident_triage_service.entity.Alert;
import com.pratham.incident_triage_service.entity.IncidentEvent;
import com.pratham.incident_triage_service.model.User;
import com.pratham.incident_triage_service.repository.AlertRepository;
import com.pratham.incident_triage_service.repository.IncidentEventRepository;
import com.pratham.incident_triage_service.repository.UserRepository;
import com.pratham.incident_triage_service.service.IncidentWorkflowService;
import com.pratham.incident_triage_service.service.SseBroadcaster;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.*;
import java.util.stream.Collectors;

// Jira-style ticket operations: edit fields, comments, activity history, people.
@RestController
@RequestMapping("/api")
public class IncidentController {

    private final AlertRepository alertRepository;
    private final IncidentEventRepository eventRepository;
    private final UserRepository userRepository;
    private final IncidentWorkflowService workflow;
    private final SseBroadcaster broadcaster;

    public IncidentController(AlertRepository alertRepository, IncidentEventRepository eventRepository,
                              UserRepository userRepository, IncidentWorkflowService workflow,
                              SseBroadcaster broadcaster) {
        this.alertRepository = alertRepository;
        this.eventRepository = eventRepository;
        this.userRepository = userRepository;
        this.workflow = workflow;
        this.broadcaster = broadcaster;
    }

    // Partial update. Only keys present in the body change; each change is logged.
    @PatchMapping("/alerts/{id}")
    public ResponseEntity<?> updateIncident(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        Optional<Alert> optionalAlert = alertRepository.findByIdAndDeletedFalse(id);
        if (optionalAlert.isEmpty()) return ResponseEntity.notFound().build();
        Alert alert = optionalAlert.get();
        String actor = IncidentWorkflowService.currentUser();

        if (body.containsKey("ticketStatus")) {
            String status = String.valueOf(body.get("ticketStatus"));
            if (!IncidentWorkflowService.TICKET_STATUSES.contains(status)) {
                return ResponseEntity.badRequest().body("ticketStatus must be one of " + IncidentWorkflowService.TICKET_STATUSES);
            }
            workflow.transition(alert, status, actor);
        }

        if (body.containsKey("priority")) {
            String priority = String.valueOf(body.get("priority"));
            if (!IncidentWorkflowService.PRIORITIES.contains(priority)) {
                return ResponseEntity.badRequest().body("priority must be P1, P2, P3 or P4");
            }
            if (!priority.equals(alert.getPriority())) {
                String old = alert.getPriority();
                alert.setPriority(priority);
                workflow.log(id, "PRIORITY", actor, (old == null ? "none" : old) + " → " + priority);
                // Re-base the SLA unless someone already set a custom due date
                if (!body.containsKey("dueAt")) {
                    alert.setDueAt(IncidentWorkflowService.dueFor(priority, alert.getCreatedAt()));
                }
            }
        }

        if (body.containsKey("assignee")) {
            Object raw = body.get("assignee");
            String assignee = raw == null || String.valueOf(raw).isBlank() ? null : String.valueOf(raw);
            if (assignee != null && !userRepository.existsByUsername(assignee)) {
                return ResponseEntity.badRequest().body("Unknown user: " + assignee);
            }
            if (!Objects.equals(assignee, alert.getAssignee())) {
                alert.setAssignee(assignee);
                workflow.log(id, "ASSIGNEE", actor, assignee == null ? "Unassigned" : "Assigned to " + assignee);
                // Picking up an untouched ticket starts work on it
                if (assignee != null && "OPEN".equals(alert.getTicketStatus())) {
                    workflow.transition(alert, "IN_PROGRESS", actor);
                }
            }
        }

        if (body.containsKey("dueAt")) {
            Object raw = body.get("dueAt");
            LocalDateTime due;
            try {
                due = raw == null || String.valueOf(raw).isBlank() ? null : LocalDateTime.parse(String.valueOf(raw));
            } catch (DateTimeParseException e) {
                return ResponseEntity.badRequest().body("dueAt must be an ISO date-time, e.g. 2026-10-20T17:00:00");
            }
            if (!Objects.equals(due, alert.getDueAt())) {
                alert.setDueAt(due);
                workflow.log(id, "DUE", actor, due == null ? "Due date cleared" : "Due " + due.toString().replace('T', ' '));
            }
        }

        if (body.containsKey("labels")) {
            Object raw = body.get("labels");
            List<String> labels = raw instanceof Collection<?> c
                    ? c.stream().map(String::valueOf).toList()
                    : Arrays.asList(String.valueOf(raw == null ? "" : raw).split(","));
            String joined = labels.stream().map(String::trim).filter(l -> !l.isEmpty())
                    .map(l -> l.toLowerCase().replaceAll("[^a-z0-9._-]+", "-").replaceAll("^-+|-+$", ""))
                    .filter(l -> !l.isEmpty())
                    .distinct().limit(10).collect(Collectors.joining(","));
            String value = joined.isEmpty() ? null : joined;
            if (!Objects.equals(value, alert.getLabels())) {
                alert.setLabels(value);
                workflow.log(id, "LABELS", actor, value == null ? "Labels cleared" : "Labels: " + value.replace(",", ", "));
            }
        }

        Alert saved = alertRepository.save(alert);
        broadcaster.broadcastUpdate();
        return ResponseEntity.ok(saved);
    }

    @GetMapping("/alerts/{id}/activity")
    public ResponseEntity<List<IncidentEvent>> activity(@PathVariable Long id) {
        if (alertRepository.findByIdAndDeletedFalse(id).isEmpty()) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(eventRepository.findByAlertIdOrderByCreatedAtAsc(id));
    }

    @PostMapping("/alerts/{id}/comments")
    public ResponseEntity<?> addComment(@PathVariable Long id, @RequestBody Map<String, String> body) {
        String text = body.get("body");
        if (text == null || text.isBlank()) return ResponseEntity.badRequest().body("body is required");
        if (text.length() > 5000) return ResponseEntity.badRequest().body("Comment is too long (5000 characters max)");
        if (alertRepository.findByIdAndDeletedFalse(id).isEmpty()) return ResponseEntity.notFound().build();

        IncidentEvent saved = eventRepository.save(
                new IncidentEvent(id, "COMMENT", IncidentWorkflowService.currentUser(), text.trim()));
        broadcaster.broadcastUpdate();
        return ResponseEntity.ok(saved);
    }

    // Latest events across all incidents, for the overview feed. Deleted incidents are skipped.
    @GetMapping("/activity")
    public List<Map<String, Object>> recentActivity() {
        List<IncidentEvent> events = eventRepository.findRecentForActiveAlerts(org.springframework.data.domain.PageRequest.of(0, 40));
        Map<Long, Alert> alerts = alertRepository.findAllById(events.stream().map(IncidentEvent::getAlertId).distinct().toList())
                .stream().collect(Collectors.toMap(Alert::getId, a -> a));
        return events.stream()
                .filter(e -> alerts.containsKey(e.getAlertId()) && !alerts.get(e.getAlertId()).isDeleted())
                .map(e -> {
                    Alert a = alerts.get(e.getAlertId());
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", e.getId());
                    m.put("alertId", e.getAlertId());
                    m.put("type", e.getType());
                    m.put("actor", e.getActor());
                    m.put("message", e.getMessage());
                    m.put("createdAt", e.getCreatedAt());
                    m.put("source", a.getSource());
                    m.put("alertMessage", a.getMessage());
                    return m;
                })
                .toList();
    }

    // People who can be assigned (no emails or other personal data).
    @GetMapping("/users")
    public List<Map<String, Object>> users() {
        return userRepository.findAll().stream()
                .filter(User::isEnabled)
                .map(u -> Map.<String, Object>of(
                        "username", u.getUsername(),
                        "roles", u.getRoles().stream().map(r -> r.getName().toString()).sorted().toList()))
                .sorted(Comparator.comparing(m -> String.valueOf(m.get("username"))))
                .toList();
    }
}
