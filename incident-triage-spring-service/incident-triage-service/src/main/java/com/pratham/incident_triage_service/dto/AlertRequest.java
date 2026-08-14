package com.pratham.incident_triage_service.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class AlertRequest {

    @NotBlank(message = "source is required")
    private String source;

    @NotBlank(message = "message is required")
    private String message;
}