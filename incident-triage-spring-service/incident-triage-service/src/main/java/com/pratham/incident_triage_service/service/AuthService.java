package com.pratham.incident_triage_service.service;

import com.pratham.incident_triage_service.dto.LoginRequest;
import com.pratham.incident_triage_service.dto.LoginResponse;
import com.pratham.incident_triage_service.dto.RegisterRequest;
import com.pratham.incident_triage_service.model.Role;
import com.pratham.incident_triage_service.model.RoleType;
import com.pratham.incident_triage_service.model.User;
import com.pratham.incident_triage_service.repository.RoleRepository;
import com.pratham.incident_triage_service.repository.UserRepository;
import com.pratham.incident_triage_service.util.JwtTokenProvider;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class AuthService {
    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationManager authenticationManager;
    private final JwtTokenProvider jwtTokenProvider;

    public AuthService(UserRepository userRepository, RoleRepository roleRepository,
                        PasswordEncoder passwordEncoder, AuthenticationManager authenticationManager,
                        JwtTokenProvider jwtTokenProvider) {
        this.userRepository = userRepository;
        this.roleRepository = roleRepository;
        this.passwordEncoder = passwordEncoder;
        this.authenticationManager = authenticationManager;
        this.jwtTokenProvider = jwtTokenProvider;
    }

    public LoginResponse register(RegisterRequest request) {
        if (userRepository.existsByUsername(request.getUsername()))
            throw new IllegalStateException("Username already taken");
        if (userRepository.existsByEmail(request.getEmail()))
            throw new IllegalStateException("Email already registered");

        User user = new User(request.getUsername(), request.getEmail(),
                passwordEncoder.encode(request.getPassword()));

        Role viewerRole = roleRepository.findByName(RoleType.VIEWER)
                .orElseThrow(() -> new IllegalStateException("VIEWER role not seeded"));
        Set<Role> roles = new HashSet<>();
        roles.add(viewerRole);
        user.setRoles(roles);
        userRepository.save(user);

        String token = jwtTokenProvider.generateTokenFromUsername(user.getUsername());
        return new LoginResponse(token, user.getUsername(), user.getEmail(), List.of(RoleType.VIEWER.toString()));
    }

    public LoginResponse login(LoginRequest request) {
        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.getUsername(), request.getPassword()));

        User user = userRepository.findByUsername(request.getUsername())
                .orElseThrow(() -> new IllegalStateException("User not found"));

        String token = jwtTokenProvider.generateTokenFromUsername(user.getUsername());
        List<String> roleNames = user.getRoles().stream()
                .map(r -> r.getName().toString()).collect(Collectors.toList());

        return new LoginResponse(token, user.getUsername(), user.getEmail(), roleNames);
    }
}