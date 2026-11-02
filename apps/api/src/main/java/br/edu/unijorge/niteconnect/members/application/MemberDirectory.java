package br.edu.unijorge.niteconnect.members.application;

import br.edu.unijorge.niteconnect.members.domain.Member;
import br.edu.unijorge.niteconnect.members.domain.MemberStatus;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import br.edu.unijorge.niteconnect.shared.api.PageResult;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.Locale;
import java.util.Collection;
import java.util.Map;
import java.util.HashMap;
import java.util.UUID;

/** Explicit member-module contract. Other modules do not query member tables directly. */
@Repository
public class MemberDirectory {
    private final JdbcTemplate jdbc;
    private static final RowMapper<Member> MAPPER = (rs, row) -> new Member(rs.getObject("id", UUID.class),
            rs.getString("name"), rs.getString("institutional_email"), MemberStatus.valueOf(rs.getString("status")),
            rs.getLong("version"), rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("updated_at").toInstant());

    public MemberDirectory(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public Member require(UUID id) {
        return jdbc.query("select * from nite_connect.members where id=?", MAPPER, id).stream()
                .findFirst().orElseThrow(ApiException::notFound);
    }
    /** Minimal read contract for project team display; never exposes member contact details. */
    public Map<UUID, String> names(Collection<UUID> ids) {
        if (ids.isEmpty()) return Map.of();
        String placeholders = String.join(",", java.util.Collections.nCopies(ids.size(), "?"));
        Map<UUID, String> result = new HashMap<>();
        jdbc.query("select id,name from nite_connect.members where id in (" + placeholders + ")",
                (rs, row) -> Map.entry(rs.getObject("id", UUID.class), rs.getString("name")), ids.toArray())
                .forEach(entry -> result.put(entry.getKey(), entry.getValue()));
        return result;
    }
    /** Read-only candidate contract: one controlled query joins current project participation. */
    public PageResult<Candidate> candidates(UUID project, String query, int page, int size) {
        PageResult.validate(page, size);
        if (query == null || query.strip().codePointCount(0, query.strip().length()) < 2 || query.length() > 160) {
            throw ApiException.invalid("Informe ao menos 2 caracteres para pesquisar integrantes");
        }
        String escaped = query.strip().replace("!", "!!").replace("%", "!%").replace("_", "!_");
        String pattern = "%" + escaped + "%";
        String where = """
                 from nite_connect.members m
                 where m.status='ATIVO' and m.name ilike ? escape '!'
                   and not exists (
                     select 1 from nite_connect.project_memberships p
                     where p.project_id=? and p.member_id=m.id and p.ended_at is null
                   )
                """;
        long total = jdbc.queryForObject("select count(*)" + where, Long.class, pattern, project);
        return new PageResult<>(jdbc.query("select m.id,m.name" + where + " order by m.name,m.id limit ? offset ?",
                (rs, row) -> new Candidate(rs.getObject("id", UUID.class), rs.getString("name")),
                pattern, project, size, (long) page * size), page, size, total);
    }
    public record Candidate(UUID id, String name) {}

    /** Search contract for active members that can be selected as meeting invitees. */
    public PageResult<Candidate> activeCandidates(String query, int page, int size) {
        PageResult.validate(page, size);
        String normalized = query == null ? "" : query.strip();
        if (normalized.codePointCount(0, normalized.length()) < 2 || normalized.length() > 160) {
            throw ApiException.invalid("Informe ao menos 2 caracteres para pesquisar integrantes");
        }
        String escaped = normalized.replace("!", "!!").replace("%", "!%").replace("_", "!_");
        String pattern = "%" + escaped + "%";
        String where = " from nite_connect.members where status='ATIVO' and name ilike ? escape '!'";
        long total = jdbc.queryForObject("select count(*)" + where, Long.class, pattern);
        return new PageResult<>(jdbc.query("select id,name" + where + " order by name,id limit ? offset ?",
                (rs, row) -> new Candidate(rs.getObject("id", UUID.class), rs.getString("name")),
                pattern, size, (long) page * size), page, size, total);
    }

    /** Frequency snapshot contract: active identities and their display names only. */
    public java.util.List<RosterMember> activeRoster() {
        return jdbc.query("select id,name from nite_connect.members where status='ATIVO' order by id",
                (rs, row) -> new RosterMember(rs.getObject("id", UUID.class), rs.getString("name")));
    }
    public record RosterMember(UUID id, String displayName) {}

    /** Assignment selection differs from team recruitment: require existing project participation. */
    public PageResult<Candidate> activityCandidates(UUID project, String query, Collection<UUID> excluded, int page, int size) {
        PageResult.validate(page, size);
        if (query == null || query.strip().codePointCount(0, query.strip().length()) < 2 || query.length() > 160) {
            throw ApiException.invalid("Informe ao menos 2 caracteres para pesquisar integrantes");
        }
        String pattern = "%" + query.strip().replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
        var args = new java.util.ArrayList<Object>(); args.add(pattern);
        String where = " from nite_connect.members m where m.status='ATIVO' and m.name ilike ? escape '!'";
        if (project != null) {
            where += " and exists(select 1 from nite_connect.project_memberships p where p.project_id=? and p.member_id=m.id and p.ended_at is null)";
            args.add(project);
        }
        if (!excluded.isEmpty()) {
            where += " and m.id not in (" + String.join(",", java.util.Collections.nCopies(excluded.size(), "?")) + ")";
            args.addAll(excluded);
        }
        long total = jdbc.queryForObject("select count(*)" + where, Long.class, args.toArray());
        args.add(size); args.add((long) page * size);
        return new PageResult<>(jdbc.query("select m.id,m.name" + where + " order by m.name,m.id limit ? offset ?",
                (rs, row) -> new Candidate(rs.getObject("id", UUID.class), rs.getString("name")), args.toArray()), page, size, total);
    }
    public PageResult<Member> list(int page, int size, MemberStatus status) {
        PageResult.validate(page, size);
        String where = status == null ? "" : " where status=?";
        Object[] countArgs = status == null ? new Object[0] : new Object[]{status.name()};
        Object[] args = status == null ? new Object[]{size, (long) page * size} : new Object[]{status.name(), size, (long) page * size};
        return new PageResult<>(jdbc.query("select * from nite_connect.members" + where + " order by name,id limit ? offset ?", MAPPER, args),
                page, size, jdbc.queryForObject("select count(*) from nite_connect.members" + where, Long.class, countArgs));
    }
    public Member create(String name, String email, MemberStatus status) {
        UUID id = UUID.randomUUID();
        validate(name, email);
        jdbc.update("insert into nite_connect.members(id,name,institutional_email,status) values (?,?,?,?)",
                id, name.trim(), normalizeEmail(email), status.name());
        return require(id);
    }
    public Member update(UUID id, String name, String email, long expectedVersion) {
        validate(name, email);
        changed(jdbc.update("""
                update nite_connect.members set name=?,institutional_email=?,version=version+1,updated_at=current_timestamp
                where id=? and version=?
                """, name.trim(), normalizeEmail(email), id, expectedVersion));
        return require(id);
    }
    public Member status(UUID id, MemberStatus status, long expectedVersion) {
        changed(jdbc.update("update nite_connect.members set status=?,version=version+1,updated_at=current_timestamp where id=? and version=?",
                status.name(), id, expectedVersion));
        return require(id);
    }
    public void touch(UUID id, long expectedVersion) {
        changed(jdbc.update("update nite_connect.members set version=version+1,updated_at=current_timestamp where id=? and version=?", id, expectedVersion));
    }
    public void checkVersion(Member member, long expectedVersion) {
        if (member.version() != expectedVersion) throw ApiException.conflict("Cadastro alterado; consulte a versão atual");
    }
    private void changed(int count) { if (count != 1) throw ApiException.conflict("Cadastro alterado; consulte a versão atual"); }
    public static String normalizeEmail(String email) { return email.trim().toLowerCase(Locale.ROOT); }
    public static void validate(String name, String email) {
        if (name == null || name.isBlank() || name.length() > 160 || email == null || email.length() > 254
                || !normalizeEmail(email).matches("[^@\\s]+@unijorge\\.com\\.br")) {
            throw ApiException.invalid("Nome e e-mail institucional válidos são obrigatórios");
        }
    }
}
