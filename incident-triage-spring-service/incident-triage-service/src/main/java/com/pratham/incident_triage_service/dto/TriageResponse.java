package com.pratham.incident_triage_service.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class TriageResponse {
    private String decision;
    private String alert;

    @JsonProperty("matched_incident_id")
    private Long matchedIncidentId;

    @JsonProperty("matched_log")
    private String matchedLog;

    @JsonProperty("suggested_resolution")
    private String suggestedResolution;

    @JsonProperty("confidence_distance")
    private Double confidenceDistance;

    private String reasoning;
    private String severity;
    private String category;
}