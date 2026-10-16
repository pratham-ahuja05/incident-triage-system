package com.pratham.incident_triage_service.dto;

import com.pratham.incident_triage_service.entity.Alert;
import com.pratham.incident_triage_service.entity.TriageResult;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

@Data
@NoArgsConstructor
public class AlertWithResult {
    private Long id;
    private String source;
    private String message;
    private String status;
    private int retryCount;
    private LocalDateTime createdAt;

    // ticket workflow
    private String ticketStatus;
    private String priority;
    private String assignee;
    private String reporter;
    private LocalDateTime dueAt;
    private LocalDateTime resolvedAt;
    private String labels;
    private long commentCount;
    private String investigation;
    private LocalDateTime investigatedAt;
    private Long duplicateOfId;

    // triage result
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
    private Long retrievalMs;
    private Long aiCheckMs;
    private Long classifyMs;

    public static AlertWithResult of(Alert alert, TriageResult result, long commentCount) {
        AlertWithResult dto = new AlertWithResult();
        dto.id = alert.getId();
        dto.source = alert.getSource();
        dto.message = alert.getMessage();
        dto.status = alert.getStatus();
        dto.retryCount = alert.getRetryCount();
        dto.createdAt = alert.getCreatedAt();
        dto.ticketStatus = alert.getTicketStatus() == null ? "OPEN" : alert.getTicketStatus();
        dto.priority = alert.getPriority();
        dto.assignee = alert.getAssignee();
        dto.reporter = alert.getReporter();
        dto.dueAt = alert.getDueAt();
        dto.resolvedAt = alert.getResolvedAt();
        dto.labels = alert.getLabels();
        dto.commentCount = commentCount;
        dto.investigation = alert.getInvestigation();
        dto.investigatedAt = alert.getInvestigatedAt();
        dto.duplicateOfId = alert.getDuplicateOfId();
        if (result != null) {
            dto.triageResultId = result.getId();
            dto.decision = result.getDecision();
            dto.suggestedResolution = result.getSuggestedResolution();
            dto.reasoning = result.getReasoning();
            dto.confidenceDistance = result.getConfidenceDistance();
            dto.humanReviewStatus = result.getHumanReviewStatus();
            dto.humanResolutionNote = result.getHumanResolutionNote();
            dto.matchedIncidentId = result.getMatchedIncidentId();
            dto.matchedLog = result.getMatchedLog();
            dto.severity = result.getSeverity();
            dto.category = result.getCategory();
            dto.retrievalMs = result.getRetrievalMs();
            dto.aiCheckMs = result.getAiCheckMs();
            dto.classifyMs = result.getClassifyMs();
        }
        return dto;
    }
}
