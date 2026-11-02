package br.edu.unijorge.niteconnect.meetings.api;

import br.edu.unijorge.niteconnect.access.application.AccessService;
import br.edu.unijorge.niteconnect.identity.application.IdentityDirectory;
import br.edu.unijorge.niteconnect.members.application.MemberDirectory;
import br.edu.unijorge.niteconnect.meetings.application.MeetingService;
import br.edu.unijorge.niteconnect.shared.api.PageResult;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/meetings")
public class MeetingController {
    private final MemberDirectory members;
    private final IdentityDirectory identities;
    private final AccessService access;
    private final MeetingService meetings;

    public MeetingController(MemberDirectory members, IdentityDirectory identities, AccessService access, MeetingService meetings) {
        this.members = members;
        this.identities = identities;
        this.access = access;
        this.meetings = meetings;
    }

    @GetMapping("/invitees")
    PageResult<MemberDirectory.Candidate> invitees(@AuthenticationPrincipal Jwt jwt,
                                                   @RequestParam String q,
                                                   @RequestParam(defaultValue = "0") int page,
                                                   @RequestParam(defaultValue = "20") int size) {
        access.requireActive(identities.member(jwt));
        return members.activeCandidates(q, page, size);
    }

    @GetMapping
    PageResult<MeetingContracts.MeetingView> list(@AuthenticationPrincipal Jwt jwt,
                                                   @RequestParam(defaultValue = "upcoming") String scope,
                                                   @RequestParam(defaultValue = "0") int page,
                                                   @RequestParam(defaultValue = "20") int size) {
        return meetings.list(identities.member(jwt), scope, page, size);
    }

    @GetMapping("/{meetingId}")
    MeetingContracts.MeetingView get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID meetingId) {
        return meetings.get(identities.member(jwt), meetingId);
    }

    @PostMapping
    ResponseEntity<?> create(@AuthenticationPrincipal Jwt jwt,
                             @RequestHeader("Idempotency-Key") String idempotencyKey,
                             @Valid @RequestBody MeetingContracts.Create input) {
        var result = meetings.create(identities.member(jwt), jwt.getTokenValue(), idempotencyKey, input);
        Object body = result.operation() == null ? result.meeting() : result.operation();
        return ResponseEntity.status(HttpStatus.valueOf(result.httpStatus())).body(body);
    }

    @PatchMapping("/{meetingId}")
    ResponseEntity<?> update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID meetingId,
                             @RequestHeader("Idempotency-Key") String idempotencyKey,
                             @Valid @RequestBody MeetingContracts.Update input) {
        var result = meetings.update(identities.member(jwt), jwt.getTokenValue(), meetingId, idempotencyKey, input);
        Object body = result.operation() == null ? result.meeting() : result.operation();
        return ResponseEntity.status(HttpStatus.valueOf(result.httpStatus())).body(body);
    }

    @PostMapping("/{meetingId}/cancel")
    ResponseEntity<?> cancel(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID meetingId,
                             @RequestHeader("Idempotency-Key") String idempotencyKey,
                             @Valid @RequestBody MeetingContracts.Cancel input) {
        var result = meetings.cancel(identities.member(jwt), jwt.getTokenValue(), meetingId, idempotencyKey, input);
        Object body = result.operation() == null ? result.meeting() : result.operation();
        return ResponseEntity.status(HttpStatus.valueOf(result.httpStatus())).body(body);
    }

    @PutMapping("/{meetingId}/my-response")
    MeetingContracts.Invitee respond(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID meetingId,
                                     @Valid @RequestBody MeetingContracts.Respond input) {
        return meetings.respond(identities.member(jwt), meetingId, input);
    }

    @GetMapping("/{meetingId}/join")
    ResponseEntity<Void> join(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID meetingId) {
        String url = meetings.joinUrl(identities.member(jwt), meetingId);
        return ResponseEntity.status(HttpStatus.SEE_OTHER)
                .header(HttpHeaders.LOCATION, URI.create(url).toASCIIString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .header("Referrer-Policy", "no-referrer")
                .build();
    }

    @GetMapping("/{meetingId}/share")
    MeetingContracts.ShareLink share(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID meetingId) {
        return meetings.shareLink(identities.member(jwt), meetingId);
    }

    @GetMapping("/{meetingId}/attendance")
    MeetingContracts.Attendance attendance(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID meetingId) {
        return meetings.attendance(identities.member(jwt), identities.tenant(jwt), jwt.getTokenValue(), meetingId);
    }
}
