package com.pratham.incident_triage_service.dto;

public class MarkDuplicateRequest {
    private Long duplicateId;
    public Long getDuplicateId() { return duplicateId; }
    public void setDuplicateId(Long duplicateId) { this.duplicateId = duplicateId; }
}