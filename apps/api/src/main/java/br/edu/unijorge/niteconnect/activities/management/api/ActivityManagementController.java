package br.edu.unijorge.niteconnect.activities.management.api;

import br.edu.unijorge.niteconnect.activities.domain.ActivityStatus;
import br.edu.unijorge.niteconnect.activities.management.application.ActivityManagementService;
import br.edu.unijorge.niteconnect.activities.infrastructure.ActivityRepository.Filter;
import br.edu.unijorge.niteconnect.identity.application.IdentityDirectory;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.util.UUID;

@RestController
public class ActivityManagementController {
    private final ActivityManagementService service;
    private final IdentityDirectory identities;
    public ActivityManagementController(ActivityManagementService service,IdentityDirectory identities) { this.service=service;this.identities=identities; }
    @GetMapping("/api/v1/management/activities")
    ActivityManagementContracts.Result global(@AuthenticationPrincipal Jwt jwt,@RequestParam(required=false) UUID projectId,@RequestParam(required=false) UUID memberId,
            @RequestParam(required=false) UUID planningId,@RequestParam(required=false) ActivityStatus status,@RequestParam(required=false) String priority,
            @RequestParam(required=false) UUID executorId,@RequestParam(required=false) LocalDate dueFrom,@RequestParam(required=false) LocalDate dueTo,
            @RequestParam(required=false) LocalDate startFrom,@RequestParam(required=false) LocalDate startTo,@RequestParam(required=false) Boolean overdue,
            @RequestParam(required=false) String q,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) {
        return service.global(identities.member(jwt),new Filter(status,projectId,executorId,dueFrom,dueTo,overdue,q,priority,startFrom,startTo,null,null,planningId),memberId,page,size);
    }
    @GetMapping("/api/v1/projects/{projectId}/management/activities")
    ActivityManagementContracts.Result project(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID projectId,@RequestParam(required=false) UUID memberId,
            @RequestParam(required=false) UUID planningId,@RequestParam(required=false) ActivityStatus status,@RequestParam(required=false) String priority,
            @RequestParam(required=false) UUID executorId,@RequestParam(required=false) LocalDate dueFrom,@RequestParam(required=false) LocalDate dueTo,
            @RequestParam(required=false) LocalDate startFrom,@RequestParam(required=false) LocalDate startTo,@RequestParam(required=false) Boolean overdue,
            @RequestParam(required=false) String q,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) {
        return service.project(identities.member(jwt),new Filter(status,projectId,executorId,dueFrom,dueTo,overdue,q,priority,startFrom,startTo,null,null,planningId),memberId,page,size);
    }
}
