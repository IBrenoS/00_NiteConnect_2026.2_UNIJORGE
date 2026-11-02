package br.edu.unijorge.niteconnect.attendance.api;

import br.edu.unijorge.niteconnect.attendance.application.FrequencyService;
import br.edu.unijorge.niteconnect.attendance.domain.Frequency.*;
import br.edu.unijorge.niteconnect.identity.application.IdentityDirectory;
import br.edu.unijorge.niteconnect.shared.api.PageResult;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static br.edu.unijorge.niteconnect.attendance.api.FrequencyContracts.*;

@RestController
public class FrequencyController {
    private final FrequencyService frequency;
    private final IdentityDirectory identities;

    public FrequencyController(FrequencyService frequency, IdentityDirectory identities) {
        this.frequency = frequency;
        this.identities = identities;
    }

    @PostMapping("/api/v1/attendance/lists")
    ResponseEntity<ListView> open(@AuthenticationPrincipal Jwt jwt,
                                  @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
                                  @Valid @RequestBody OpenList command) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(frequency.open(identities.member(jwt), command, idempotencyKey));
    }

    @GetMapping("/api/v1/attendance/lists")
    PageResult<ListView> lists(@AuthenticationPrincipal Jwt jwt,
                               @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                               @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                               @RequestParam(required = false) String status,
                               @RequestParam(defaultValue = "0") int page,
                               @RequestParam(defaultValue = "20") int size) {
        return frequency.lists(identities.member(jwt), from, to, status, page, size);
    }

    @GetMapping("/api/v1/attendance/lists/{listId}")
    ListView list(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID listId) {
        return frequency.list(identities.member(jwt), listId);
    }

    @GetMapping("/api/v1/attendance/lists/{listId}/participants")
    ParticipantPage participants(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID listId,
                                 @RequestParam(required = false) String status,
                                 @RequestParam(required = false) @Size(max = 120) String name,
                                 @RequestParam(defaultValue = "0") int page,
                                 @RequestParam(defaultValue = "50") int size) {
        return frequency.participants(identities.member(jwt), listId, status, name, page, size);
    }

    @GetMapping("/api/v1/attendance/lists/{listId}/updates")
    List<ListUpdate> updates(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID listId,
                             @RequestParam(defaultValue = "0") long afterVersion) {
        return frequency.updates(identities.member(jwt), listId, afterVersion);
    }

    @PostMapping("/api/v1/attendance/lists/{listId}/qr/renew")
    ResponseEntity<QrPayload> renewQr(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID listId,
                                      @Valid @RequestBody RenewQr command) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(frequency.renewQr(identities.member(jwt), listId, command));
    }

    @PostMapping("/api/v1/attendance/lists/{listId}/finalize")
    ListView finalizeList(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID listId,
                          @Valid @RequestBody FinalizeList command) {
        return frequency.finalizeList(identities.member(jwt), listId, command);
    }

    @PostMapping("/api/v1/attendance/lists/{listId}/cancel")
    ListView cancelList(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID listId,
                        @Valid @RequestBody CancelList command) {
        return frequency.cancelList(identities.member(jwt), listId, command);
    }

    @PatchMapping("/api/v1/attendance/lists/{listId}/participants/{memberId}")
    ParticipantView changeParticipant(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID listId,
                                      @PathVariable UUID memberId, @Valid @RequestBody ChangeParticipant command) {
        return frequency.changeParticipant(identities.member(jwt), listId, memberId, command);
    }

    @PostMapping("/api/v1/frequency/qr/handoffs")
    ResponseEntity<Handoff> createHandoff(@Valid @RequestBody CreateHandoff command) {
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore())
                .body(frequency.createHandoff(command.qrToken()));
    }

    @PostMapping("/api/v1/me/frequency/confirmations")
    ResponseEntity<Confirmation> confirm(@AuthenticationPrincipal Jwt jwt,
                                         @Valid @RequestBody ConfirmPresence command) {
        Confirmation result = frequency.confirm(identities.member(jwt), command);
        return ResponseEntity.status(result.alreadyRegistered() ? HttpStatus.OK : HttpStatus.CREATED).body(result);
    }

    @GetMapping("/api/v1/me/frequency/open-lists")
    ResponseEntity<List<PersonalOpenList>> personalOpenLists(@AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(frequency.personalOpenLists(identities.member(jwt)));
    }

    @GetMapping("/api/v1/me/frequency/summary")
    Summary personalSummary(@AuthenticationPrincipal Jwt jwt,
                            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                            @RequestParam(required = false) GroupBy groupBy) {
        return frequency.personalSummary(identities.member(jwt), from, to, groupBy);
    }

    @GetMapping("/api/v1/me/frequency/history")
    PageResult<HistoryEntry> personalHistory(@AuthenticationPrincipal Jwt jwt,
                                              @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                              @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                              @RequestParam(defaultValue = "0") int page,
                                              @RequestParam(defaultValue = "20") int size) {
        return frequency.personalHistory(identities.member(jwt), from, to, page, size);
    }

    @GetMapping("/api/v1/attendance/frequency/summary")
    PageResult<CollectiveSummaryRow> collectiveSummary(@AuthenticationPrincipal Jwt jwt,
                                                        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                                        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                                        @RequestParam(required = false) @Size(max = 120) String name,
                                                        @RequestParam(defaultValue = "0") int page,
                                                        @RequestParam(defaultValue = "50") int size) {
        return frequency.collectiveSummary(identities.member(jwt), from, to, name, page, size);
    }

    @GetMapping("/api/v1/attendance/frequency/members/{memberId}/history")
    PageResult<HistoryEntry> collectiveHistory(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID memberId,
                                                @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                                @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                                @RequestParam(defaultValue = "0") int page,
                                                @RequestParam(defaultValue = "50") int size) {
        return frequency.collectiveHistory(identities.member(jwt), memberId, from, to, page, size);
    }
}
