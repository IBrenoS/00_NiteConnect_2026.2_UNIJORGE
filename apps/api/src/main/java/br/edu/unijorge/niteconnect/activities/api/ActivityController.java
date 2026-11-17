package br.edu.unijorge.niteconnect.activities.api;

import br.edu.unijorge.niteconnect.activities.application.ActivityService;
import br.edu.unijorge.niteconnect.activities.application.ActivityCapabilities;
import br.edu.unijorge.niteconnect.activities.application.ActivityService.*;
import br.edu.unijorge.niteconnect.activities.domain.ActivityStatus;
import br.edu.unijorge.niteconnect.activities.infrastructure.ActivityRepository.*;
import br.edu.unijorge.niteconnect.identity.application.IdentityDirectory;
import br.edu.unijorge.niteconnect.members.application.MemberDirectory;
import br.edu.unijorge.niteconnect.shared.api.PageResult;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.util.UUID;

@RestController
public class ActivityController {
    private final ActivityService service; private final IdentityDirectory identities; private final ActivityCapabilities capabilities;
    public ActivityController(ActivityService service,IdentityDirectory identities,ActivityCapabilities capabilities) { this.service=service;this.identities=identities;this.capabilities=capabilities; }
    @GetMapping("/api/v1/me/activities/capabilities") ActivityCapabilities.Personal personalCapabilities(@AuthenticationPrincipal Jwt jwt) { return capabilities.personal(identities.member(jwt)); }
    @GetMapping("/api/v1/activities/{id}/capabilities") ActivityCapabilities.View capabilities(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) { return capabilities.read(identities.member(jwt),id); }
    @GetMapping("/api/v1/activities/{id}/evidence/{evidenceId}/capabilities") ActivityCapabilities.EvidenceView evidenceCapabilities(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@PathVariable UUID evidenceId) { return capabilities.evidence(identities.member(jwt),id,evidenceId); }
    @PostMapping("/api/v1/activities") @ResponseStatus(HttpStatus.CREATED)
    View create(@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody ActivityContracts.Create c) { return service.create(identities.member(jwt),c); }
    @GetMapping("/api/v1/activities/{id}") View read(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) { return service.read(identities.member(jwt),id); }
    @PatchMapping("/api/v1/activities/{id}") View update(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@Valid @RequestBody ActivityContracts.Update c) { return service.update(identities.member(jwt),id,c); }
    @DeleteMapping("/api/v1/activities/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@Valid @RequestBody ActivityContracts.Delete c) { service.delete(identities.member(jwt),id,c); }
    @PatchMapping("/api/v1/activities/{id}/status") View status(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@Valid @RequestBody ActivityContracts.StatusChange c) { return service.status(identities.member(jwt),id,c); }
    @GetMapping({"/api/v1/activities","/api/v1/me/activities"})
    PageResult<View> list(@AuthenticationPrincipal Jwt jwt,jakarta.servlet.http.HttpServletRequest request,
            @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size,
            @RequestParam(required=false) ActivityStatus status,@RequestParam(required=false) UUID projectId,
            @RequestParam(required=false) UUID executorId,@RequestParam(required=false) LocalDate dueFrom,
            @RequestParam(required=false) LocalDate dueTo,@RequestParam(required=false) Boolean overdue,
            @RequestParam(required=false) String q,@RequestParam(required=false) String priority,
            @RequestParam(required=false) LocalDate startFrom,@RequestParam(required=false) LocalDate startTo,
            @RequestParam(defaultValue="createdAt") String sort,@RequestParam(defaultValue="desc") String direction,
            @RequestParam(required=false) UUID planningId) {
        boolean own=request.getRequestURI().equals("/api/v1/me/activities");
        return service.list(identities.member(jwt),own,new Filter(status,projectId,executorId,dueFrom,dueTo,overdue,own?q:null,priority,startFrom,startTo,sort,direction,planningId),page,size);
    }
    @GetMapping("/api/v1/projects/{id}/activities")
    PageResult<View> project(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestParam(defaultValue="0") int page,
            @RequestParam(defaultValue="20") int size,@RequestParam(required=false) ActivityStatus status,
            @RequestParam(required=false) UUID executorId,@RequestParam(required=false) LocalDate dueFrom,
            @RequestParam(required=false) LocalDate dueTo,@RequestParam(required=false) Boolean overdue,
            @RequestParam(required=false) String priority,@RequestParam(required=false) LocalDate startFrom,
            @RequestParam(required=false) LocalDate startTo,@RequestParam(defaultValue="createdAt") String sort,
            @RequestParam(defaultValue="desc") String direction,@RequestParam(required=false) UUID planningId) {
        return service.projectList(identities.member(jwt),id,new Filter(status,id,executorId,dueFrom,dueTo,overdue,null,priority,startFrom,startTo,sort,direction,planningId),page,size);
    }
    @GetMapping("/api/v1/activities/{id}/assignees")
    PageResult<Assignee> assignees(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) { return service.assignees(identities.member(jwt),id,page,size); }
    @GetMapping("/api/v1/activities/{id}/assignees/history")
    PageResult<HistoricalAssignee> assignmentHistory(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) { return service.assignmentHistory(identities.member(jwt),id,page,size); }
    @GetMapping("/api/v1/activities/{id}/history")
    PageResult<Event> history(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) { return service.history(identities.member(jwt),id,page,size); }
    @GetMapping("/api/v1/me/activities/history")
    PageResult<PersonalPeriod> personalHistory(@AuthenticationPrincipal Jwt jwt,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) { return service.personalHistory(identities.member(jwt),page,size); }
    @PutMapping("/api/v1/activities/{id}/executor")
    Assignee executor(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@Valid @RequestBody ActivityContracts.Assign c) { return service.assign(identities.member(jwt),id,c,true); }
    @PostMapping("/api/v1/activities/{id}/collaborators") @ResponseStatus(HttpStatus.CREATED)
    Assignee collaborator(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@Valid @RequestBody ActivityContracts.Assign c) { return service.assign(identities.member(jwt),id,c,false); }
    @DeleteMapping("/api/v1/activities/{id}/collaborators/{memberId}") @ResponseStatus(HttpStatus.NO_CONTENT)
    void end(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@PathVariable UUID memberId,@Valid @RequestBody ActivityContracts.Command c) { service.end(identities.member(jwt),id,memberId,c); }
    @GetMapping("/api/v1/activities/{id}/assignee-candidates")
    PageResult<MemberDirectory.Candidate> candidates(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestParam(required=false) String query,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) { return service.candidates(identities.member(jwt),id,null,query,page,size); }
    @GetMapping("/api/v1/projects/{id}/activity-assignee-candidates")
    PageResult<MemberDirectory.Candidate> projectCandidates(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestParam(required=false) String query,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) { return service.candidates(identities.member(jwt),null,id,query,page,size); }
    @GetMapping("/api/v1/activities/independent-assignee-candidates")
    PageResult<MemberDirectory.Candidate> independentCandidates(@AuthenticationPrincipal Jwt jwt,@RequestParam(required=false) String query,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) { return service.candidates(identities.member(jwt),null,null,query,page,size); }
}
