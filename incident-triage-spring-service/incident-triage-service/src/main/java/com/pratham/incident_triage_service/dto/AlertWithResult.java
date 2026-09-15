package com.pratham.incident_triage_service.dto;

import lombok.Data;
import lombok.AllArgsConstructor;
import java.time.LocalDateTime;

@Data
@AllArgsConstructor
public class AlertWithResult {
    private Long id;
    private String source;
    private String message;
    private String status;
    private int retryCount;
    private LocalDateTime createdAt;

    private Long triageResultId;
    private String decision;
    private String suggestedResolution;
    private String reasoning;
    private Double confidenceDistance;
    private String humanReviewStatus;
    private String humanResolutionNote;
    private Long matchedIncidentId;
    private String matchedLog;
    private String severity;
    private String category;
}