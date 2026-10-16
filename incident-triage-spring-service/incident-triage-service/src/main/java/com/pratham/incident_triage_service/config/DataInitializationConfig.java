package com.pratham.incident_triage_service.config;

import com.pratham.incident_triage_service.model.Role;
import com.pratham.incident_triage_service.model.RoleType;
import com.pratham.incident_triage_service.model.User;
import com.pratham.incident_triage_service.repository.RoleRepository;
import com.pratham.incident_triage_service.repository.UserRepository;
import com.pratham.incident_triage_service.service.IncidentWorkflowService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;
import java.util.Set;

@Configuration
public class DataInitializationConfig {
    @Value("${app.seed-demo-users:true}")
    private boolean seedDemoUsers;

    @Bean
    public CommandLineRunner initRoles(RoleRepository roleRepository,
                                       UserRepository userRepository,
                                       PasswordEncoder passwordEncoder,
                                       IncidentWorkflowService workflow) {
        return args -> {
            workflow.backfill();

            for (RoleType type : RoleType.values()) {
                if (roleRepository.findByName(type).isEmpty()) {
                    roleRepository.save(new Role(type));
                }
            }

            if (!seedDemoUsers) return;
            seedUser("admin",   "admin@demo.com",   RoleType.ADMIN,   roleRepository, userRepository, passwordEncoder);
            seedUser("analyst", "analyst@demo.com", RoleType.ANALYST, roleRepository, userRepository, passwordEncoder);
            seedUser("viewer",  "viewer@demo.com",  RoleType.VIEWER,  roleRepository, userRepository, passwordEncoder);
        };
    }

    private void seedUser(String username, String email, RoleType roleType,
                          RoleRepository roleRepository, UserRepository userRepository,
                          PasswordEncoder passwordEncoder) {
        if (userRepository.existsByUsername(username)) return;
        Role role = roleRepository.findByName(roleType).orElseThrow();
        User user = new User(username, email, passwordEncoder.encode("password123"));
        user.setRoles(Set.of(role));
        userRepository.save(user);
    }
}