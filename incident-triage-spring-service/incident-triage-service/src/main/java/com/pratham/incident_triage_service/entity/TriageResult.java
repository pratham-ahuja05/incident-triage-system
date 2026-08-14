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
    private Long alertId; // FK reference to Alert.id — kept simple (no @ManyToOne) for now

    @Column(nullable = false)
    private String decision; // "auto_suggest_fix" or "escalate"

    @Column(columnDefinition = "TEXT")
    private String suggestedResolution; // nullable — only present for auto_suggest_fix

    @Column(columnDefinition = "TEXT")
    private String reasoning;

    private Double confidenceDistance; // nullable — only present for auto_suggest_fix

    @Column(nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }
}