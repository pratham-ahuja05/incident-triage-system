package com.pratham.incident_triage_service.config;

import com.pratham.incident_triage_service.service.CustomUserDetailsService;
import com.pratham.incident_triage_service.util.JwtTokenProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.authentication.builders.AuthenticationManagerBuilder;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity(prePostEnabled = true)
public class SecurityConfig {

    @Value("${app.cors.allowed-origins:}")
    private String allowedOrigins;

    private final CustomUserDetailsService customUserDetailsService;
    private final JwtTokenProvider jwtTokenProvider;

    public SecurityConfig(CustomUserDetailsService customUserDetailsService, JwtTokenProvider jwtTokenProvider) {
        this.customUserDetailsService = customUserDetailsService;
        this.jwtTokenProvider = jwtTokenProvider;
    }

    @Bean
    public PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(); }

    @Bean
public DaoAuthenticationProvider authenticationProvider() {
    DaoAuthenticationProvider authProvider = new DaoAuthenticationProvider(customUserDetailsService);
    authProvider.setPasswordEncoder(passwordEncoder());
    return authProvider;
}

    @Bean
    public AuthenticationManager authenticationManager(HttpSecurity http) throws Exception {
        AuthenticationManagerBuilder builder = http.getSharedObject(AuthenticationManagerBuilder.class);
        builder.authenticationProvider(authenticationProvider());
        return builder.build();
    }

    @Bean
    public JwtAuthenticationFilter jwtAuthenticationFilter() {
        return new JwtAuthenticationFilter(jwtTokenProvider, customUserDetailsService);
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(authz -> authz
                        .requestMatchers("/auth/login", "/auth/register").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/alerts/stream").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/alerts/**").hasAnyRole("VIEWER", "ANALYST", "MANAGER", "ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/alerts/*/retry").hasAnyRole("ANALYST", "MANAGER", "ADMIN")
                        .requestMatchers(HttpMethod.PUT, "/api/alerts/*/restore").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.DELETE, "/api/alerts/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/alerts").hasAnyRole("ANALYST", "MANAGER", "ADMIN")
                        .requestMatchers(HttpMethod.GET, "/api/alerts/search").hasAnyRole("VIEWER", "ANALYST", "MANAGER", "ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/alerts/*/mark-duplicate").hasAnyRole("ANALYST", "MANAGER", "ADMIN")
                        .requestMatchers(HttpMethod.GET, "/api/triage-results/**").hasAnyRole("VIEWER", "ANALYST", "MANAGER", "ADMIN")
                        .requestMatchers(HttpMethod.POST, "/api/triage-results/**").hasAnyRole("ANALYST", "MANAGER", "ADMIN")
                        .requestMatchers(HttpMethod.GET, "/api/analytics").hasAnyRole("VIEWER", "ANALYST", "MANAGER", "ADMIN")
                        .anyRequest().authenticated()
                )
                .addFilterBefore(jwtAuthenticationFilter(), UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        List<String> configuredOrigins = Arrays.stream(allowedOrigins.split(","))
                .map(String::trim).filter(o -> !o.isEmpty()).collect(Collectors.toList());
        if (configuredOrigins.isEmpty()) configuredOrigins = List.of("http://localhost:5173");

        configuration.setAllowedOrigins(configuredOrigins);
        configuration.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setExposedHeaders(List.of("Authorization"));
        configuration.setAllowCredentials(false);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}