package com.pratham.incident_triage_service.entity;

import jakarta.persistence.*;
import org.hibernate.annotations.ColumnDefault;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;

@Entity
@Table(name = "alerts")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Alert {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String source;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String message;

    @Column(nullable = false)
    private String status;

    private int retryCount = 0;

    @Column(nullable = false)
    @ColumnDefault("false")
    private boolean deleted = false;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    // ---- Ticket workflow (Jira-style). All nullable or DB-defaulted so ddl-auto can add them to existing rows.

    // OPEN -> IN_PROGRESS -> IN_REVIEW -> RESOLVED -> CLOSED (separate from the processing `status` above)
    @Column(length = 32)
    @ColumnDefault("'OPEN'")
    private String ticketStatus = "OPEN";

    // P1 (highest) .. P4 (lowest); derived from AI severity at triage time unless set by a person
    @Column(length = 4)
    private String priority;

    private String assignee;

    private String reporter;

    private LocalDateTime dueAt;

    private LocalDateTime resolvedAt;

    // comma-separated
    @Column(columnDefinition = "TEXT")
    private String labels;

    // Latest AI investigation, stored as the JSON returned by the AI service
    @Column(columnDefinition = "TEXT")
    private String investigation;

    private LocalDateTime investigatedAt;

    // Set when this incident is closed as a duplicate of another one
    private Long duplicateOfId;

    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
            name = "alert_duplicates",
            joinColumns = @JoinColumn(name = "alert_id"),
            inverseJoinColumns = @JoinColumn(name = "duplicate_alert_id")
    )
    private Set<Alert> duplicates = new HashSet<>();

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        if (this.status == null) {
            this.status = "PENDING";
        }
        if (this.ticketStatus == null) {
            this.ticketStatus = "OPEN";
        }
    }
}