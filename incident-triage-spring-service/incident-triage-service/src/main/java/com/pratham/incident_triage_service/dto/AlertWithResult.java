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
    private LocalDateTime createdAt;

    // nullable — alert abhi tak process nahi hua ho sakta
    private String decision;
    private String suggestedResolution;
    private String reasoning;
    private Double confidenceDistance;
}