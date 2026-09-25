package com.pratham.incident_triage_service.config;

import com.pratham.incident_triage_service.model.Role;
import com.pratham.incident_triage_service.model.RoleType;
import com.pratham.incident_triage_service.repository.RoleRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class DataInitializationConfig {
    @Bean
    public CommandLineRunner initRoles(RoleRepository roleRepository) {
        return args -> {
            for (RoleType type : RoleType.values()) {
                if (roleRepository.findByName(type).isEmpty()) {
                    roleRepository.save(new Role(type));
                }
            }
        };
    }
}