package br.edu.unijorge.niteconnect.shared.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;

@Configuration
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class SecurityConfiguration {

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, ObjectProvider<JwtDecoder> decoders) throws Exception {
        JwtDecoder decoder = decoders.getIfAvailable();
        AuthorizationManager<RequestAuthorizationContext> authenticatedJwt = (authentication, context) ->
                new AuthorizationDecision(decoder != null && authentication.get().isAuthenticated()
                        && authentication.get() instanceof JwtAuthenticationToken);
        http
                .csrf(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .requestCache(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers("/actuator/health").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/frequency/qr/handoffs").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/academic/enrollments/*/homologation", "/api/v1/academic/enrollments/*/reviews", "/api/v1/me/academic/enrollments/*/reviews", "/api/v1/academic/enrollments/*/history", "/api/v1/academic/homologations/*/forwardings").access(authenticatedJwt)
                        .requestMatchers(HttpMethod.GET, "/api/v1/me/dashboard", "/api/v1/projects/*/dashboard", "/api/v1/analytics/dashboard",
                                "/api/v1/me/reports/*", "/api/v1/me/reports/*/export",
                                "/api/v1/projects/*/reports/*", "/api/v1/projects/*/reports/*/export",
                                "/api/v1/analytics/reports/*", "/api/v1/analytics/reports/*/export",
                                "/api/v1/analytics/history", "/api/v1/projects/*/analytics/history",
                                "/api/v1/me/analytics/comparison", "/api/v1/projects/*/analytics/comparison", "/api/v1/analytics/comparison").access(authenticatedJwt)
                        .requestMatchers(HttpMethod.POST, "/api/v1/me/academic/enrollments/*/reviews", "/api/v1/academic/enrollments/*/reviews", "/api/v1/academic/reviews/*/decisions", "/api/v1/academic/calculations/*/homologations", "/api/v1/academic/homologations/*/reopen", "/api/v1/academic/homologations/*/forwardings").access(authenticatedJwt)
                        .requestMatchers(HttpMethod.GET, "/api/v1/academic/enrollments/*/assessments", "/api/v1/academic/enrollments/*/calculations", "/api/v1/me/academic/enrollments/*/assessments", "/api/v1/me/academic/enrollments/*/calculations").access(authenticatedJwt)
                        .requestMatchers(HttpMethod.POST, "/api/v1/academic/enrollments/*/assessments", "/api/v1/academic/enrollments/*/calculations").access(authenticatedJwt)
                        .requestMatchers(HttpMethod.GET, "/api/v1/me/academic/enrollments/*/evidence", "/api/v1/academic/enrollments/*/evidence", "/api/v1/academic/evidence/*/comparison").access(authenticatedJwt)
                        .requestMatchers(HttpMethod.POST, "/api/v1/me/academic/enrollments/*/evidence", "/api/v1/academic/enrollments/*/evidence", "/api/v1/academic/enrollments/*/presentations").access(authenticatedJwt)
                        .requestMatchers(HttpMethod.GET, "/api/v1/me/academic/enrollments/*/plans", "/api/v1/academic/enrollments/*/plans").access(authenticatedJwt)
                        .requestMatchers(HttpMethod.POST, "/api/v1/me/academic/enrollments/*/plans", "/api/v1/me/academic/plans/*/submission", "/api/v1/academic/plans/*/decisions").access(authenticatedJwt)
                        .requestMatchers(HttpMethod.GET, "/api/v1/me/academic/enrollments", "/api/v1/me/academic/enrollments/*", "/api/v1/academic/enrollments", "/api/v1/academic/enrollments/*").access(authenticatedJwt)
                        .requestMatchers(HttpMethod.POST, "/api/v1/me/academic/enrollments", "/api/v1/academic/enrollments/*/decisions").access(authenticatedJwt)
                        .requestMatchers(HttpMethod.PUT, "/api/v1/me/academic/enrollments/*").access(authenticatedJwt)
                        .requestMatchers(HttpMethod.GET, "/api/v1/academic/terms", "/api/v1/academic/terms/*/policies").access(authenticatedJwt)
                        .requestMatchers(HttpMethod.POST, "/api/v1/academic/terms", "/api/v1/academic/terms/*/policies", "/api/v1/academic/policies/*/confirmation").access(authenticatedJwt)
                        .requestMatchers(HttpMethod.GET, "/api/v1/agenda/events", "/api/v1/agenda/events/*", "/api/v1/agenda/events/*/participants",
                                "/api/v1/meetings", "/api/v1/meetings/**", "/api/v1/me/notifications",
                                "/api/v1/me/agenda/expected-events", "/api/v1/me/attendance",
                                "/api/v1/attendance/lists", "/api/v1/attendance/lists/*", "/api/v1/attendance/lists/*/participants",
                                "/api/v1/attendance/lists/*/updates", "/api/v1/attendance/frequency/summary",
                                "/api/v1/attendance/frequency/members/*/history",
                                "/api/v1/me/frequency/summary", "/api/v1/me/frequency/history",
                                "/api/v1/me/frequency/open-lists").access(authenticatedJwt)
                        .requestMatchers(HttpMethod.POST, "/api/v1/agenda/events", "/api/v1/agenda/events/*/session", "/api/v1/agenda/events/*/close", "/api/v1/agenda/events/*/cancel",
                                "/api/v1/meetings", "/api/v1/meetings/*/cancel", "/api/v1/meetings/*/teams-link", "/api/v1/me/notifications/*/read",
                                "/api/v1/me/attendance/check-in", "/api/v1/me/attendance/check-out", "/api/v1/me/attendance/*/return",
                                "/api/v1/attendance/lists", "/api/v1/attendance/lists/*/qr/renew",
                                "/api/v1/attendance/lists/*/finalize", "/api/v1/attendance/lists/*/cancel",
                                "/api/v1/me/frequency/confirmations").access(authenticatedJwt)
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/attendance/lists/*/participants/*").access(authenticatedJwt)
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/agenda/events/*").access(authenticatedJwt)
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/meetings/*").access(authenticatedJwt)
                        .requestMatchers(HttpMethod.PUT, "/api/v1/meetings/*/my-response").access(authenticatedJwt)
                        .requestMatchers(HttpMethod.GET, "/api/v1/activities", "/api/v1/activities/*",
                                "/api/v1/me/activities", "/api/v1/me/activities/history", "/api/v1/me/activities/capabilities", "/api/v1/activities/*/history", "/api/v1/activities/*/capabilities",
                                "/api/v1/activities/*/assignees", "/api/v1/activities/*/assignees/history",
                                "/api/v1/activities/*/assignee-candidates", "/api/v1/projects/*/activities",
                                "/api/v1/projects/*/activity-assignee-candidates").access(authenticatedJwt)
                        .requestMatchers(HttpMethod.POST, "/api/v1/activities", "/api/v1/activities/*/collaborators").access(authenticatedJwt)
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/activities/*", "/api/v1/activities/*/status").access(authenticatedJwt)
                        .requestMatchers(HttpMethod.PUT, "/api/v1/activities/*/executor").access(authenticatedJwt)
                        .requestMatchers(HttpMethod.DELETE, "/api/v1/activities/*/collaborators/*").access(authenticatedJwt)
                        .requestMatchers(HttpMethod.GET, "/api/v1/activities/*/evidence", "/api/v1/activities/*/evidence/*",
                                "/api/v1/activities/*/evidence/*/download", "/api/v1/activities/*/evidence/*/capabilities", "/api/v1/me/activities/evidence",
                                "/api/v1/me/activities/evidence/*", "/api/v1/me/activities/evidence/*/download").access(authenticatedJwt)
                        .requestMatchers(HttpMethod.POST, "/api/v1/activities/*/evidence", "/api/v1/activities/*/evidence/uploads",
                                "/api/v1/activities/*/evidence/*/withdraw").access(authenticatedJwt)
                        .requestMatchers(HttpMethod.GET, "/api/v1/projects", "/api/v1/projects/*", "/api/v1/me/projects",
                                "/api/v1/me/projects/history", "/api/v1/me/projects/leadership/history", "/api/v1/projects/*/history", "/api/v1/projects/*/members",
                                "/api/v1/projects/*/members/history", "/api/v1/projects/*/leadership", "/api/v1/projects/*/leadership/history",
                                "/api/v1/projects/*/health", "/api/v1/projects/*/health-history", "/api/v1/projects/*/health-policy/history",
                                "/api/v1/projects/*/member-candidates",
                                "/api/v1/proposals", "/api/v1/proposals/*").access(authenticatedJwt)
                        .requestMatchers(HttpMethod.POST, "/api/v1/projects", "/api/v1/projects/*/members",
                                "/api/v1/projects/*/leadership-transfers", "/api/v1/proposals",
                                "/api/v1/projects/*/health-policy", "/api/v1/projects/*/health-evaluations",
                                "/api/v1/proposals/*/decisions", "/api/v1/proposals/*/convert").access(authenticatedJwt)
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/projects/*", "/api/v1/projects/*/status",
                                "/api/v1/proposals/*").access(authenticatedJwt)
                        .requestMatchers(HttpMethod.DELETE, "/api/v1/projects/*/members/*").access(authenticatedJwt)
                        .requestMatchers(HttpMethod.GET, "/api/v1/me", "/api/v1/members", "/api/v1/members/*",
                                "/api/v1/members/*/history", "/api/v1/invitations", "/api/v1/audit-events")
                            .access(authenticatedJwt)
                        .requestMatchers(HttpMethod.POST, "/api/v1/members", "/api/v1/invitations",
                                "/api/v1/invitations/*/accept", "/api/v1/members/*/roles")
                            .access(authenticatedJwt)
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/members/*", "/api/v1/members/*/status")
                            .access(authenticatedJwt)
                        .requestMatchers(HttpMethod.DELETE, "/api/v1/members/*/roles/*", "/api/v1/invitations/*")
                            .access(authenticatedJwt)
                        .anyRequest().denyAll());
        if (decoder != null) {
            http.oauth2ResourceServer(resource -> resource.jwt(jwt -> jwt.decoder(decoder)));
        }
        return http.build();
    }
}
