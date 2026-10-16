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

    // Stage timings reported by the AI service, in milliseconds (null = stage did not run / not recorded)
    private Long retrievalMs;
    private Long aiCheckMs;
    private Long classifyMs;
    private Long matchedIncidentId;

    @Column(columnDefinition = "TEXT")
    private String matchedLog;

    private String severity;
    private String category;

    @Column(columnDefinition = "TEXT")
    private String humanResolutionNote;

    @Column(nullable = false)
    private String humanReviewStatus = "PENDING_REVIEW";

    @Column(nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }
}