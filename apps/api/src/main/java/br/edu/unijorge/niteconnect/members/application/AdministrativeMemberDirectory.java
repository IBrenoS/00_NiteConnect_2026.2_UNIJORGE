package br.edu.unijorge.niteconnect.members.application;

import br.edu.unijorge.niteconnect.access.application.AccessService;
import br.edu.unijorge.niteconnect.members.domain.MemberStatus;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import br.edu.unijorge.niteconnect.shared.api.PageResult;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

@Service
public class AdministrativeMemberDirectory {
    private final JdbcTemplate jdbc;
    private final AccessService access;

    public AdministrativeMemberDirectory(JdbcTemplate jdbc, AccessService access) {
        this.jdbc = jdbc; this.access = access;
    }

    public record Summary(UUID id, String name, String institutionalEmail, MemberStatus status,
                          List<String> roles, boolean hasPhoto, Instant lastAccessAt) {}
    public record Detail(UUID id, String name, String institutionalEmail, MemberStatus status,
                         List<String> roles, boolean hasPhoto, String course, String practiceArea,
                         LocalDate birthDate, long version, Instant lastAccessAt) {}

    private static List<String> roles(String value) {
        if (value == null || value.isEmpty()) return List.of("INTEGRANTE");
        return java.util.stream.Stream.concat(java.util.stream.Stream.of("INTEGRANTE"),
                Arrays.stream(value.split(","))).toList();
    }

    private static final String BASE = """
            from nite_connect.members m
            left join lateral (select string_agg(r.role, ',' order by r.role) roles
                               from nite_connect.role_assignments r where r.member_id=m.id) assigned on true
            """;
    private static final RowMapper<Summary> SUMMARY = (rs, row) -> new Summary(
            rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("institutional_email"),
            MemberStatus.valueOf(rs.getString("status")), roles(rs.getString("roles")), rs.getBoolean("has_photo"),
            rs.getTimestamp("last_access_at") == null ? null : rs.getTimestamp("last_access_at").toInstant());

    @Transactional(readOnly = true)
    public PageResult<Summary> list(UUID actor, String query, MemberStatus status, int page, int size) {
        access.requireAdministrator(actor);
        PageResult.validate(page, size);
        String term = query == null ? "" : query.strip();
        if (term.length() > 160) throw ApiException.invalid("Pesquisa deve ter até 160 caracteres");
        String escaped = "%" + term.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
        String where = " where (m.name ilike ? escape '!' or m.institutional_email ilike ? escape '!')"
                + (status == null ? "" : " and m.status=?");
        Object[] count = status == null ? new Object[]{escaped, escaped} : new Object[]{escaped, escaped, status.name()};
        Object[] rows = status == null ? new Object[]{escaped, escaped, size, (long) page * size}
                : new Object[]{escaped, escaped, status.name(), size, (long) page * size};
        long total = jdbc.queryForObject("select count(*) from nite_connect.members m" + where, Long.class, count);
        return new PageResult<>(jdbc.query("select m.id,m.name,m.institutional_email,m.status,"
                + "m.photo_object_id is not null has_photo,m.last_access_at,assigned.roles " + BASE + where
                + " order by m.name,m.id limit ? offset ?", SUMMARY, rows), page, size, total);
    }

    @Transactional(readOnly = true)
    public Detail detail(UUID actor, UUID target) {
        access.requireAdministrator(actor);
        return jdbc.query("select m.id,m.name,m.institutional_email,m.status,m.photo_object_id is not null has_photo,"
                + "m.course,m.practice_area,m.birth_date,m.version,m.last_access_at,assigned.roles " + BASE + " where m.id=?",
                (rs, row) -> new Detail(rs.getObject("id", UUID.class), rs.getString("name"),
                        rs.getString("institutional_email"), MemberStatus.valueOf(rs.getString("status")),
                        roles(rs.getString("roles")), rs.getBoolean("has_photo"), rs.getString("course"),
                        rs.getString("practice_area"), rs.getObject("birth_date", LocalDate.class), rs.getLong("version"),
                        rs.getTimestamp("last_access_at") == null ? null : rs.getTimestamp("last_access_at").toInstant()),
                target).stream().findFirst().orElseThrow(ApiException::notFound);
    }

}
