package com.pratham.incident_triage_service.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import java.time.LocalDateTime;

@Entity
@Table(name = "triage_results")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class TriageResult {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long alertId;

    @Column(nullable = false)
    private String decision;

    @Column(columnDefinition = "TEXT")
    private String suggestedResolution;

    @Column(columnDefinition = "TEXT")
    private String reasoning;

    private Double confidenceDistance;

    // NEW — populated whenever a candidate incident was retrieved, whether or not it was ultimately used
    private Long matchedIncidentId;

    @Column(columnDefinition = "TEXT")
    private String matchedLog;

    @Column(nullable = false)
    private String humanReviewStatus = "PENDING_REVIEW";

    @Column(nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }
}