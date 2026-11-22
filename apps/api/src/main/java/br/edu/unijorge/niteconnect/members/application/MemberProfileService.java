package br.edu.unijorge.niteconnect.members.application;

import br.edu.unijorge.niteconnect.access.application.AccessService;
import br.edu.unijorge.niteconnect.documents.application.DocumentObjectStore;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.LocalDate;
import java.util.UUID;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import javax.imageio.ImageIO;

@Service
public class MemberProfileService {
    private static final int MAX_PHOTO_BYTES = 2 * 1024 * 1024;
    private final JdbcTemplate jdbc;
    private final AccessService access;
    private final ObjectProvider<DocumentObjectStore> objects;

    public MemberProfileService(JdbcTemplate jdbc, AccessService access, ObjectProvider<DocumentObjectStore> objects) {
        this.jdbc = jdbc; this.access = access; this.objects = objects;
    }

    public record Profile(UUID id, String name, String institutionalEmail, String course,
                          String practiceArea, LocalDate birthDate, boolean hasPhoto, long version) {}
    public record AdministrativeProfile(UUID id, String name, String institutionalEmail,
                                        String course, String practiceArea, boolean hasPhoto, long version) {}
    public record Photo(byte[] bytes, String contentType) {}

    @Transactional(readOnly = true)
    public Profile own(UUID actor) {
        access.requireActive(actor);
        return jdbc.query("select id,name,institutional_email,course,practice_area,birth_date,photo_object_id,version "
                        + "from nite_connect.members where id=?", (rs, row) -> new Profile(
                        rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("institutional_email"),
                        rs.getString("course"), rs.getString("practice_area"), rs.getObject("birth_date", LocalDate.class),
                        rs.getObject("photo_object_id", UUID.class) != null, rs.getLong("version")), actor)
                .stream().findFirst().orElseThrow(ApiException::notFound);
    }

    @Transactional(readOnly = true)
    public AdministrativeProfile administrative(UUID actor, UUID member) {
        access.requireAdministrator(actor);
        return jdbc.query("select id,name,institutional_email,course,practice_area,photo_object_id,version "
                        + "from nite_connect.members where id=?", (rs, row) -> new AdministrativeProfile(
                        rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("institutional_email"),
                        rs.getString("course"), rs.getString("practice_area"),
                        rs.getObject("photo_object_id", UUID.class) != null, rs.getLong("version")), member)
                .stream().findFirst().orElseThrow(ApiException::notFound);
    }

    @Transactional
    public Profile update(UUID actor, String course, String area, LocalDate birthDate, long expectedVersion) {
        access.requireActive(actor);
        String normalizedCourse = normalize(course, "Curso");
        String normalizedArea = normalize(area, "Área de atuação");
        if (birthDate != null && (birthDate.isBefore(LocalDate.of(1900, 1, 1)) || birthDate.isAfter(LocalDate.now())))
            throw ApiException.invalid("Data de nascimento deve estar entre 1900 e hoje");
        changed(jdbc.update("""
                update nite_connect.members set course=?,practice_area=?,birth_date=?,version=version+1,updated_at=current_timestamp
                where id=? and version=? and status='ATIVO'
                """, normalizedCourse, normalizedArea, birthDate, actor, expectedVersion));
        return own(actor);
    }

    @Transactional
    public Profile upload(UUID actor, byte[] bytes, String declaredType, long expectedVersion) {
        access.requireActive(actor);
        String type = imageType(bytes);
        if (!type.equals(declaredType)) throw ApiException.invalid("O formato da foto não corresponde ao arquivo");
        validateImage(bytes);
        UUID old = photoId(actor);
        UUID fresh = UUID.randomUUID();
        store().putAsset(fresh, bytes, type);
        try {
            changed(jdbc.update("""
                    update nite_connect.members set photo_object_id=?,photo_content_type=?,version=version+1,updated_at=current_timestamp
                    where id=? and version=? and status='ATIVO'
                    """, fresh, type, actor, expectedVersion));
        } catch (RuntimeException ex) {
            store().deleteAssetOrphan(fresh);
            throw ex;
        }
        afterCompletion(fresh, old);
        return own(actor);
    }

    @Transactional
    public Profile remove(UUID actor, long expectedVersion) {
        access.requireActive(actor);
        UUID old = photoId(actor);
        if (old != null) store();
        changed(jdbc.update("""
                update nite_connect.members set photo_object_id=null,photo_content_type=null,version=version+1,updated_at=current_timestamp
                where id=? and version=? and status='ATIVO'
                """, actor, expectedVersion));
        afterCompletion(null, old);
        return own(actor);
    }

    @Transactional(readOnly = true)
    public Photo photo(UUID actor, UUID member) {
        access.requireActive(actor);
        String status = access.isAdministrator(actor) ? "" : " and status='ATIVO'";
        return jdbc.query("select photo_object_id,photo_content_type from nite_connect.members where id=?" + status,
                (rs, row) -> {
                    UUID id = rs.getObject(1, UUID.class);
                    if (id == null) throw ApiException.notFound();
                    byte[] bytes = store().getAsset(id);
                    if (bytes.length > MAX_PHOTO_BYTES) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Foto indisponível");
                    return new Photo(bytes, rs.getString(2));
                }, member).stream().findFirst().orElseThrow(ApiException::notFound);
    }

    private UUID photoId(UUID member) {
        return jdbc.queryForObject("select photo_object_id from nite_connect.members where id=?", UUID.class, member);
    }

    private static String normalize(String value, String label) {
        if (value == null) return null;
        String trimmed = value.strip();
        if (trimmed.isEmpty()) return null;
        if (trimmed.length() > 160) throw ApiException.invalid(label + " deve ter até 160 caracteres");
        return trimmed;
    }

    private static String imageType(byte[] bytes) {
        if (bytes == null || bytes.length == 0 || bytes.length > MAX_PHOTO_BYTES)
            throw ApiException.invalid("Foto deve ter até 2 MiB");
        if (bytes.length >= 3 && (bytes[0] & 255) == 255 && (bytes[1] & 255) == 216 && (bytes[2] & 255) == 255)
            return "image/jpeg";
        if (bytes.length >= 8 && (bytes[0] & 255) == 137 && bytes[1] == 80 && bytes[2] == 78
                && bytes[3] == 71 && bytes[4] == 13 && bytes[5] == 10 && bytes[6] == 26 && bytes[7] == 10)
            return "image/png";
        throw ApiException.invalid("Use uma foto JPEG ou PNG válida");
    }

    private static void validateImage(byte[] bytes) {
        try (var input = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
            var readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) throw ApiException.invalid("Foto inválida");
            var reader = readers.next();
            try {
                reader.setInput(input, true, true);
                int width = reader.getWidth(0), height = reader.getHeight(0);
                if (width < 1 || height < 1 || width > 4096 || height > 4096)
                    throw ApiException.invalid("Foto deve ter até 4096 pixels por lado");
            } finally {
                reader.dispose();
            }
        } catch (IOException | IllegalArgumentException ex) {
            throw ApiException.invalid("Foto inválida");
        }
    }

    private void afterCompletion(UUID fresh, UUID old) {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCompletion(int status) {
                if (status == STATUS_COMMITTED && old != null) store().deleteAssetOrphan(old);
                if (status != STATUS_COMMITTED && fresh != null) store().deleteAssetOrphan(fresh);
            }
        });
    }

    private static void changed(int count) {
        if (count != 1) throw ApiException.conflict("Cadastro alterado; carregue o perfil atualizado");
    }

    private DocumentObjectStore store() {
        DocumentObjectStore found = objects.getIfAvailable();
        if (found == null) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Armazenamento de fotos indisponível");
        return found;
    }
}
