package br.edu.unijorge.niteconnect.activities.planning.api;

import br.edu.unijorge.niteconnect.activities.application.ActivityService;
import br.edu.unijorge.niteconnect.activities.domain.ActivityStatus;
import br.edu.unijorge.niteconnect.activities.infrastructure.ActivityRepository.Filter;
import br.edu.unijorge.niteconnect.activities.planning.application.ActivityPlanningService;
import br.edu.unijorge.niteconnect.activities.planning.domain.ActivityStatistics;
import br.edu.unijorge.niteconnect.identity.application.IdentityDirectory;
import br.edu.unijorge.niteconnect.shared.api.PageResult;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.util.UUID;

@RestController
public class ActivityPlanningController {
    private final ActivityPlanningService service;
    private final IdentityDirectory identities;
    public ActivityPlanningController(ActivityPlanningService service,IdentityDirectory identities) { this.service=service;this.identities=identities; }

    @PostMapping("/api/v1/activity-plannings") @ResponseStatus(HttpStatus.CREATED)
    ActivityPlanningContracts.View create(@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody ActivityPlanningContracts.Create input) {
        return service.create(identities.member(jwt),input);
    }
    @GetMapping("/api/v1/activity-plannings")
    PageResult<ActivityPlanningContracts.View> list(@AuthenticationPrincipal Jwt jwt,@RequestParam(required=false) UUID projectId,
            @RequestParam(required=false) String q,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) {
        return service.list(identities.member(jwt),projectId,q,page,size);
    }
    @GetMapping("/api/v1/activity-plannings/{id}")
    ActivityPlanningContracts.View read(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) { return service.read(identities.member(jwt),id); }
    @GetMapping("/api/v1/activity-plannings/{id}/capabilities")
    ActivityPlanningContracts.Capabilities capabilities(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) { return service.capabilities(identities.member(jwt),id); }
    @PatchMapping("/api/v1/activity-plannings/{id}")
    ActivityPlanningContracts.View update(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@Valid @RequestBody ActivityPlanningContracts.Update input) {
        return service.update(identities.member(jwt),id,input);
    }
    @DeleteMapping("/api/v1/activity-plannings/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@Valid @RequestBody ActivityPlanningContracts.Delete input) {
        service.delete(identities.member(jwt),id,input);
    }
    @PostMapping("/api/v1/activity-plannings/{id}/tasks") @ResponseStatus(HttpStatus.CREATED)
    ActivityPlanningContracts.TaskCreated createTask(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@Valid @RequestBody ActivityPlanningContracts.CreateTask input) {
        return service.createTask(identities.member(jwt),id,input);
    }
    @GetMapping("/api/v1/activity-plannings/{id}/tasks")
    PageResult<ActivityService.View> tasks(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestParam(defaultValue="0") int page,
            @RequestParam(defaultValue="20") int size,@RequestParam(required=false) ActivityStatus status,@RequestParam(required=false) UUID executorId,
            @RequestParam(required=false) LocalDate dueFrom,@RequestParam(required=false) LocalDate dueTo,@RequestParam(required=false) Boolean overdue,
            @RequestParam(required=false) String q,@RequestParam(required=false) String priority,@RequestParam(required=false) LocalDate startFrom,
            @RequestParam(required=false) LocalDate startTo,@RequestParam(defaultValue="createdAt") String sort,@RequestParam(defaultValue="desc") String direction) {
        return service.tasks(identities.member(jwt),id,new Filter(status,null,executorId,dueFrom,dueTo,overdue,q,priority,startFrom,startTo,sort,direction),page,size);
    }
    @GetMapping("/api/v1/activity-plannings/{id}/stats")
    ActivityStatistics stats(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) { return service.planningStats(identities.member(jwt),id); }
    @GetMapping("/api/v1/me/activities/stats")
    ActivityStatistics personalStats(@AuthenticationPrincipal Jwt jwt) { return service.personalStats(identities.member(jwt)); }
    @GetMapping("/api/v1/projects/{id}/activity-stats")
    ActivityStatistics projectStats(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) { return service.projectStats(identities.member(jwt),id); }
    @GetMapping("/api/v1/members/{memberId}/activity-stats")
    ActivityStatistics memberStats(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID memberId,@RequestParam(required=false) UUID projectId) {
        return service.memberStats(identities.member(jwt),memberId,projectId);
    }
}
