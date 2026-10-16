package com.pratham.incident_triage_service.controller;

import com.pratham.incident_triage_service.dto.LoginRequest;
import com.pratham.incident_triage_service.dto.LoginResponse;
import com.pratham.incident_triage_service.dto.RegisterRequest;
import com.pratham.incident_triage_service.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/auth")
public class AuthController {
    private final AuthService authService;
    public AuthController(AuthService authService) { this.authService = authService; }

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        return ResponseEntity.ok(authService.login(request));
    }

    @PostMapping("/register")
    public ResponseEntity<?> register(@Valid @RequestBody RegisterRequest request) {
        try {
            return ResponseEntity.ok(authService.register(request));
        } catch (IllegalStateException e) {
            // duplicate username/email: tell the user instead of failing with a 500
            return ResponseEntity.status(409).body(java.util.Map.of("message", e.getMessage()));
        }
    }
}