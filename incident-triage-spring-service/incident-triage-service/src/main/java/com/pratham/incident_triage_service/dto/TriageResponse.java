package com.pratham.incident_triage_service.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class TriageResponse {

    private String decision;
    private String alert;

    @JsonProperty("matched_log")
    private String matchedLog;

    @JsonProperty("suggested_resolution")
    private String suggestedResolution;

    @JsonProperty("confidence_distance")
    private Double confidenceDistance;

    private String reasoning;
}