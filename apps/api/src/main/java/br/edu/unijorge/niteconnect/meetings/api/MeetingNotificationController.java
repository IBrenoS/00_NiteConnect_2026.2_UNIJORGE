package br.edu.unijorge.niteconnect.meetings.api;

import br.edu.unijorge.niteconnect.identity.application.IdentityDirectory;
import br.edu.unijorge.niteconnect.meetings.application.MeetingService;
import br.edu.unijorge.niteconnect.shared.api.PageResult;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/me/notifications")
public class MeetingNotificationController {
    private final IdentityDirectory identities;
    private final MeetingService meetings;

    public MeetingNotificationController(IdentityDirectory identities, MeetingService meetings) {
        this.identities = identities;
        this.meetings = meetings;
    }

    @GetMapping
    PageResult<MeetingContracts.Notification> list(@AuthenticationPrincipal Jwt jwt,
                                                   @RequestParam(defaultValue = "0") int page,
                                                   @RequestParam(defaultValue = "20") int size) {
        return meetings.notifications(identities.member(jwt), page, size);
    }

    @PostMapping("/{notificationId}/read")
    void markRead(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID notificationId) {
        meetings.markNotificationRead(identities.member(jwt), notificationId);
    }
}
