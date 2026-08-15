package com.pratham.incident_triage_service.controller;

import com.pratham.incident_triage_service.dto.AlertRequest;
import com.pratham.incident_triage_service.entity.Alert;
import com.pratham.incident_triage_service.repository.AlertRepository;
import com.pratham.incident_triage_service.service.AlertQueueProducer;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/alerts")
public class AlertController {

    @Autowired
    private AlertRepository alertRepository;

    @Autowired
    private AlertQueueProducer alertQueueProducer;

    @PostMapping
    public ResponseEntity<Alert> ingestAlert(@Valid @RequestBody AlertRequest request) {
        Alert alert = new Alert();
        alert.setSource(request.getSource());
        alert.setMessage(request.getMessage());
        Alert saved = alertRepository.save(alert);

        alertQueueProducer.enqueue(saved.getId());

        return ResponseEntity.status(HttpStatus.ACCEPTED).body(saved);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Alert> getAlert(@PathVariable Long id) {
        return alertRepository.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
}