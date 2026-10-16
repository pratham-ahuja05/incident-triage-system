package com.pratham.incident_triage_service.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

// One row per thing that happened to an incident: comments, field changes, and pipeline events.
@Entity
@Table(name = "incident_events", indexes = @Index(name = "idx_incident_events_alert", columnList = "alertId"))
@Data
@NoArgsConstructor
public class IncidentEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long alertId;

    // CREATED, TRIAGED, FAILED, RETRY, COMMENT, STATUS, ASSIGNEE, PRIORITY, DUE, LABELS, REVIEW, RESOLVED, DELETED
    @Column(nullable = false, length = 32)
    private String type;

    // username, or "system" for pipeline events
    @Column(nullable = false)
    private String actor;

    @Column(columnDefinition = "TEXT")
    private String message;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    public IncidentEvent(Long alertId, String type, String actor, String message) {
        this.alertId = alertId;
        this.type = type;
        this.actor = actor;
        this.message = message;
    }

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }
}
