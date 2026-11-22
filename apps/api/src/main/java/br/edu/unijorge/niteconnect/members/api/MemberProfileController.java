package br.edu.unijorge.niteconnect.members.api;

import br.edu.unijorge.niteconnect.identity.application.IdentityDirectory;
import br.edu.unijorge.niteconnect.members.application.MemberProfileService;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.LocalDate;
import java.util.UUID;

@RestController
public class MemberProfileController {
    private final MemberProfileService profiles;
    private final IdentityDirectory identities;

    public MemberProfileController(MemberProfileService profiles, IdentityDirectory identities) {
        this.profiles = profiles; this.identities = identities;
    }

    public record Update(@Size(max = 160) String course, @Size(max = 160) String practiceArea,
                         LocalDate birthDate, @NotNull @PositiveOrZero Long expectedVersion,
                         String name, String institutionalEmail, UUID memberId) {}
    public record Version(@NotNull @PositiveOrZero Long expectedVersion) {}

    @GetMapping("/api/v1/me/profile")
    MemberProfileService.Profile own(@AuthenticationPrincipal Jwt jwt) {
        return profiles.own(identities.member(jwt));
    }

    @GetMapping("/api/v1/members/{id}/profile")
    MemberProfileService.AdministrativeProfile administrative(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return profiles.administrative(identities.member(jwt), id);
    }

    @PatchMapping("/api/v1/me/profile")
    MemberProfileService.Profile update(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody Update input) {
        if (input.name() != null || input.institutionalEmail() != null || input.memberId() != null)
            throw ApiException.invalid("Nome, e-mail e identidade não podem ser alterados pelo perfil");
        return profiles.update(identities.member(jwt), input.course(), input.practiceArea(), input.birthDate(), input.expectedVersion());
    }

    @PostMapping(path = "/api/v1/me/profile/photo", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    MemberProfileService.Profile upload(@AuthenticationPrincipal Jwt jwt, @RequestPart("file") MultipartFile file,
                                         @RequestParam long expectedVersion) throws IOException {
        if (expectedVersion < 0 || file.isEmpty() || file.getSize() > 2L * 1024 * 1024)
            throw ApiException.invalid("Foto deve ter até 2 MiB e versão válida");
        return profiles.upload(identities.member(jwt), file.getBytes(), file.getContentType(), expectedVersion);
    }

    @DeleteMapping("/api/v1/me/profile/photo")
    MemberProfileService.Profile remove(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody Version input) {
        return profiles.remove(identities.member(jwt), input.expectedVersion());
    }

    @GetMapping("/api/v1/members/{id}/photo")
    ResponseEntity<byte[]> photo(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        MemberProfileService.Photo photo = profiles.photo(identities.member(jwt), id);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(MediaType.parseMediaType(photo.contentType()))
                .header("X-Content-Type-Options", "nosniff").body(photo.bytes());
    }
}
