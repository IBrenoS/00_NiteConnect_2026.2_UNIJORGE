package br.edu.unijorge.niteconnect.dashboard.api;

import br.edu.unijorge.niteconnect.dashboard.application.DashboardService;
import br.edu.unijorge.niteconnect.identity.application.IdentityDirectory;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/v1/dashboard")
public class DashboardController {
    private final DashboardService service;
    private final IdentityDirectory identities;
    public DashboardController(DashboardService service,IdentityDirectory identities) {
        this.service=service;this.identities=identities;
    }
    @GetMapping("/contexts")
    List<String> contexts(@AuthenticationPrincipal Jwt jwt) { return service.contexts(identities.member(jwt)); }
    @GetMapping("/personal")
    DashboardContracts.Overview personal(@AuthenticationPrincipal Jwt jwt,@RequestParam LocalDate from,@RequestParam LocalDate to) {
        return service.overview(identities.member(jwt),false,from,to);
    }
    @GetMapping("/institutional")
    DashboardContracts.Overview institutional(@AuthenticationPrincipal Jwt jwt,@RequestParam LocalDate from,@RequestParam LocalDate to) {
        return service.overview(identities.member(jwt),true,from,to);
    }
}
