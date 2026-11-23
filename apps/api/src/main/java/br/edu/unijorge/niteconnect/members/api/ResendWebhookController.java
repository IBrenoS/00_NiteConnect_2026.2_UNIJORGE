package br.edu.unijorge.niteconnect.members.api;

import br.edu.unijorge.niteconnect.members.application.InvitationService;
import br.edu.unijorge.niteconnect.members.application.ResendWebhookVerifier;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class ResendWebhookController {
    private final ResendWebhookVerifier verifier;
    private final InvitationService invitations;

    public ResendWebhookController(ResendWebhookVerifier verifier, InvitationService invitations) {
        this.verifier = verifier;
        this.invitations = invitations;
    }

    @PostMapping("/api/v1/webhooks/resend")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void receive(@RequestBody byte[] body,
            @RequestHeader(value = "svix-id", required = false) String id,
            @RequestHeader(value = "svix-timestamp", required = false) String timestamp,
            @RequestHeader(value = "svix-signature", required = false) String signature) {
        if (!verifier.verify(body, id, timestamp, signature)) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        invitations.recordDeliveryEvent(body);
    }
}
