package br.edu.unijorge.niteconnect.projects.api;

import br.edu.unijorge.niteconnect.identity.application.IdentityDirectory;
import br.edu.unijorge.niteconnect.members.application.MemberDirectory;
import br.edu.unijorge.niteconnect.projects.application.ProjectDirectory;
import br.edu.unijorge.niteconnect.projects.application.ProjectService;
import br.edu.unijorge.niteconnect.projects.application.ProjectParticipationService;
import br.edu.unijorge.niteconnect.projects.domain.Project;
import br.edu.unijorge.niteconnect.projects.domain.ProjectStatus;
import br.edu.unijorge.niteconnect.shared.api.PageResult;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.util.UUID;

@RestController
public class ProjectController {
    private final ProjectService projects;
    private final IdentityDirectory identities;
    private final ProjectParticipationService participation;
    public ProjectController(ProjectService projects, IdentityDirectory identities, ProjectParticipationService participation) { this.projects = projects; this.identities = identities; this.participation = participation; }
    @GetMapping("/api/v1/project-catalog")
    PageResult<ProjectParticipationService.CatalogProject> discover(@AuthenticationPrincipal Jwt jwt,
            @RequestParam(required=false) String q, @RequestParam(required=false) ProjectStatus status,
            @RequestParam(required=false) Boolean acceptingMembers, @RequestParam(defaultValue="name") String sort,
            @RequestParam(defaultValue="0") int page, @RequestParam(defaultValue="20") int size) {
        return participation.discover(identities.member(jwt),q,status,acceptingMembers,sort,page,size);
    }
    @GetMapping("/api/v1/project-catalog/{id}")
    ProjectParticipationService.CatalogProject presentation(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) {
        return participation.presentation(identities.member(jwt),id);
    }
    @GetMapping("/api/v1/me/project-interest-signals")
    PageResult<ProjectParticipationService.InterestSignal> myInterests(@AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) {
        return participation.myInterests(identities.member(jwt),page,size);
    }
    @GetMapping("/api/v1/projects/{id}/workspace")
    ProjectParticipationService.WorkspaceOverview overview(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) { return participation.overview(identities.member(jwt),id); }
    @GetMapping("/api/v1/projects")
    PageResult<Project> list(@AuthenticationPrincipal Jwt jwt, @RequestParam(defaultValue="0") int page,
                            @RequestParam(defaultValue="20") int size, @RequestParam(required=false) ProjectStatus status) {
        return projects.list(identities.member(jwt), false, status, page, size);
    }
    @GetMapping("/api/v1/me/projects")
    PageResult<Project> own(@AuthenticationPrincipal Jwt jwt, @RequestParam(defaultValue="0") int page,
                           @RequestParam(defaultValue="20") int size, @RequestParam(required=false) ProjectStatus status) {
        return projects.list(identities.member(jwt), true, status, page, size);
    }
    @GetMapping("/api/v1/me/projects/history")
    PageResult<ProjectDirectory.PersonalParticipation> personalHistory(@AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue="0") int page, @RequestParam(defaultValue="20") int size) {
        return projects.personalHistory(identities.member(jwt), page, size);
    }
    @GetMapping("/api/v1/projects/{id}")
    Project read(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) { return projects.read(identities.member(jwt), id); }
    @GetMapping("/api/v1/me/projects/leadership/history")
    PageResult<ProjectDirectory.PersonalLeadership> personalLeadershipHistory(@AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue="0") int page, @RequestParam(defaultValue="20") int size) {
        return projects.personalLeadershipHistory(identities.member(jwt), page, size);
    }
    @PostMapping("/api/v1/projects") @ResponseStatus(HttpStatus.CREATED)
    Project create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ProjectContracts.Create input) {
        return projects.create(identities.member(jwt), input.title(), input.description(), input.startsOn(), input.endsOn(),
                input.initialStatus()==null?ProjectStatus.PLANEJAMENTO:input.initialStatus(), input.reason());
    }
    @PostMapping(path="/api/v1/projects",consumes=MediaType.MULTIPART_FORM_DATA_VALUE) @ResponseStatus(HttpStatus.CREATED)
    Project createWithImage(@AuthenticationPrincipal Jwt jwt,@Valid @RequestPart("project") ProjectContracts.Create input,
                            @RequestPart(value="image",required=false) MultipartFile image) throws java.io.IOException {
        byte[] bytes=image==null||image.isEmpty()?null:image.getBytes();
        if(bytes==null) return projects.create(identities.member(jwt),input.title(),input.description(),input.startsOn(),input.endsOn(),
                input.initialStatus()==null?ProjectStatus.PLANEJAMENTO:input.initialStatus(),input.reason());
        return projects.createWithCover(identities.member(jwt),input.title(),input.description(),input.startsOn(),input.endsOn(),
                input.initialStatus()==null?ProjectStatus.PLANEJAMENTO:input.initialStatus(),bytes,image.getContentType());
    }
    @GetMapping("/api/v1/project-catalog/{id}/image")
    ResponseEntity<byte[]> coverImage(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) {
        ProjectService.CoverImage image=projects.image(identities.member(jwt),id);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(image.contentType()))
                .cacheControl(org.springframework.http.CacheControl.noCache()).body(image.bytes());
    }
    @PutMapping(path="/api/v1/projects/{id}/cover-image",consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    Project replaceCover(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestPart("image") MultipartFile image,
                         @RequestParam @jakarta.validation.constraints.PositiveOrZero long expectedVersion) throws java.io.IOException {
        return projects.replaceCover(identities.member(jwt),id,image.getBytes(),image.getContentType(),expectedVersion);
    }
    @DeleteMapping("/api/v1/projects/{id}/cover-image")
    Project removeCover(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@Valid @RequestBody ProjectContracts.CoverImage input) {
        return projects.removeCover(identities.member(jwt),id,input.expectedVersion());
    }
    @PatchMapping("/api/v1/projects/{id}")
    Project update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody ProjectContracts.Update input) {
        return projects.update(identities.member(jwt), id, input.title(), input.description(), input.startsOn(), input.endsOn(), input.expectedVersion(), input.reason());
    }
    @PatchMapping("/api/v1/projects/{id}/status")
    Project status(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody ProjectContracts.StatusChange input) {
        return projects.changeStatus(identities.member(jwt), id, input.status(), input.expectedVersion(), input.reason());
    }
    @GetMapping("/api/v1/projects/{id}/history")
    PageResult<ProjectDirectory.StatusEvent> history(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
            @RequestParam(defaultValue="0") int page, @RequestParam(defaultValue="20") int size) {
        return projects.history(identities.member(jwt), id, page, size);
    }
    @GetMapping("/api/v1/projects/{id}/members")
    PageResult<ProjectService.TeamMember> team(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
            @RequestParam(defaultValue="0") int page, @RequestParam(defaultValue="20") int size) {
        return projects.team(identities.member(jwt), id, page, size);
    }
    @GetMapping("/api/v1/projects/{id}/member-candidates")
    PageResult<MemberDirectory.Candidate> candidates(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
            @RequestParam(required=false) String query, @RequestParam(defaultValue="0") int page,
            @RequestParam(defaultValue="20") int size) {
        return projects.candidates(identities.member(jwt), id, query, page, size);
    }
    @PostMapping("/api/v1/projects/{id}/members") @ResponseStatus(HttpStatus.CREATED)
    ProjectDirectory.Participation join(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody ProjectContracts.Join input) {
        return projects.join(identities.member(jwt), id, input.memberId(), input.responsibility(), input.expectedVersion(), input.reason());
    }
    @DeleteMapping("/api/v1/projects/{id}/members/{memberId}") @ResponseStatus(HttpStatus.NO_CONTENT)
    void end(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @PathVariable UUID memberId, @Valid @RequestBody ProjectContracts.End input) {
        projects.end(identities.member(jwt), id, memberId, input.expectedVersion(), input.reason());
    }
    @GetMapping("/api/v1/projects/{id}/members/history")
    PageResult<ProjectDirectory.Participation> participationHistory(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
            @RequestParam(defaultValue="0") int page, @RequestParam(defaultValue="20") int size) {
        return projects.participationHistory(identities.member(jwt), id, page, size);
    }
    @GetMapping("/api/v1/projects/{id}/leadership")
    ProjectService.Leadership leadership(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) { return projects.leadership(identities.member(jwt), id); }
    @PostMapping("/api/v1/projects/{id}/leadership-transfers")
    ProjectService.Leadership transfer(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody ProjectContracts.Transfer input) {
        return projects.transfer(identities.member(jwt), id, input.memberId(), input.expectedVersion(), input.reason());
    }
    @PostMapping("/api/v1/projects/{id}/membership-requests") @ResponseStatus(HttpStatus.CREATED)
    ProjectParticipationService.MembershipRequest requestMembership(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,
            @Valid @RequestBody ProjectContracts.MembershipRequest input) { return participation.request(identities.member(jwt),id,input.message()); }
    @GetMapping("/api/v1/me/project-membership-requests")
    PageResult<ProjectParticipationService.MembershipRequest> myMembershipRequests(@AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) { return participation.myRequests(identities.member(jwt),page,size); }
    @GetMapping("/api/v1/projects/{id}/membership-requests")
    PageResult<ProjectParticipationService.MembershipRequest> membershipRequests(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,
            @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) { return participation.requests(identities.member(jwt),id,page,size); }
    @PostMapping("/api/v1/projects/{id}/membership-requests/{requestId}/decision")
    ProjectParticipationService.MembershipRequest decideMembership(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@PathVariable UUID requestId,
            @Valid @RequestBody ProjectContracts.MembershipDecision input) {
        // The service derives the project from the request and revalidates it in the transaction.
        return participation.decide(identities.member(jwt),id,requestId,input.approve(),input.message(),input.expectedVersion());
    }
    @PostMapping("/api/v1/projects/{id}/membership-requests/{requestId}/close")
    ProjectParticipationService.MembershipRequest closeMembershipRequest(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@PathVariable UUID requestId,
            @Valid @RequestBody ProjectContracts.RequestClosure input) { return participation.closeRequest(identities.member(jwt),id,requestId,input.expectedVersion()); }
    @PostMapping("/api/v1/projects/{id}/membership-requests/{requestId}/withdraw")
    ProjectParticipationService.MembershipRequest withdrawMembershipRequest(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@PathVariable UUID requestId,
            @Valid @RequestBody ProjectContracts.RequestClosure input) { return participation.withdrawRequest(identities.member(jwt),id,requestId,input.expectedVersion()); }
    @GetMapping("/api/v1/projects/{id}/membership-requests/{requestId}/history")
    PageResult<ProjectParticipationService.RequestEvent> membershipRequestHistory(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@PathVariable UUID requestId,
            @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) { return participation.requestHistory(identities.member(jwt),id,requestId,page,size); }
    @PostMapping("/api/v1/projects/{id}/interest-signals") @ResponseStatus(HttpStatus.CREATED)
    ProjectParticipationService.InterestSignal interest(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@Valid @RequestBody ProjectContracts.Interest input) {
        return participation.interest(identities.member(jwt),id,input.message());
    }
    @GetMapping("/api/v1/projects/{id}/interest-signals")
    PageResult<ProjectParticipationService.InterestSignal> interests(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,
            @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) { return participation.interests(identities.member(jwt),id,page,size); }
    @PatchMapping("/api/v1/projects/{id}/availability")
    void availability(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@Valid @RequestBody ProjectContracts.Availability input) {
        participation.availability(identities.member(jwt),id,input.acceptingMembers(),input.expectedVersion());
    }
    @GetMapping("/api/v1/me/project-participation-notifications")
    PageResult<ProjectParticipationService.ParticipationNotification> notifications(@AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size) { return participation.notifications(identities.member(jwt),page,size); }
    @PostMapping("/api/v1/me/project-participation-notifications/{notificationId}/read")
    void markNotificationRead(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID notificationId) { participation.markRead(identities.member(jwt),notificationId); }
    @GetMapping("/api/v1/projects/{id}/leadership/history")
    PageResult<ProjectDirectory.LeadershipPeriod> leadershipHistory(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
            @RequestParam(defaultValue="0") int page, @RequestParam(defaultValue="20") int size) {
        return projects.leadershipHistory(identities.member(jwt), id, page, size);
    }
}
