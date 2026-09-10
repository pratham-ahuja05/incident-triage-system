package com.pratham.incident_triage_service.controller;

import com.pratham.incident_triage_service.entity.TriageResult;
import com.pratham.incident_triage_service.repository.TriageResultRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Optional;

@RestController
@RequestMapping("/api/triage-results")
@CrossOrigin(origins = "http://localhost:5173")
public class TriageResultController {

    @Autowired
    private TriageResultRepository triageResultRepository;

    @PostMapping("/{id}/review")
    public ResponseEntity<?> reviewDecision(@PathVariable Long id, @RequestParam String decision) {
        // decision should be "APPROVED" or "REJECTED"
        if (!decision.equals("APPROVED") && !decision.equals("REJECTED")) {
            return ResponseEntity.badRequest().body("decision must be APPROVED or REJECTED");
        }

        Optional<TriageResult> optionalResult = triageResultRepository.findById(id);
        if (optionalResult.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        TriageResult result = optionalResult.get();
        result.setHumanReviewStatus(decision);
        triageResultRepository.save(result);

        return ResponseEntity.ok(result);
    }
}