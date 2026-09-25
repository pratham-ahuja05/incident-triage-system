package com.pratham.incident_triage_service.model;

import jakarta.persistence.*;

@Entity
@Table(name = "roles")
public class Role {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(unique = true, nullable = false)
    private RoleType name;

    public Role() {}
    public Role(RoleType name) { this.name = name; }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public RoleType getName() { return name; }
    public void setName(RoleType name) { this.name = name; }
}