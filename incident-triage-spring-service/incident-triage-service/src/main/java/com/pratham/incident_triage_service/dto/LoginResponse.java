package com.pratham.incident_triage_service.dto;

import java.util.List;

public class LoginResponse {
    private String token;
    private String username;
    private String email;
    private List<String> roles;

    public LoginResponse(String token, String username, String email, List<String> roles) {
        this.token = token; this.username = username; this.email = email; this.roles = roles;
    }
    public String getToken() { return token; }
    public String getUsername() { return username; }
    public String getEmail() { return email; }
    public List<String> getRoles() { return roles; }
}