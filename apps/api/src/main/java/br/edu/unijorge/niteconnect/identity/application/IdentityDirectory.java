package br.edu.unijorge.niteconnect.identity.application;

import br.edu.unijorge.niteconnect.shared.api.ApiException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import java.util.UUID;
import java.util.Optional;

@Service
public class IdentityDirectory {
    private final JdbcTemplate jdbc;
    public IdentityDirectory(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public UUID member(Jwt jwt) {
        return jdbc.query("select member_id from nite_connect.identity_accounts where tenant_id=? and object_id=?",
                (rs, row) -> rs.getObject(1, UUID.class), tenant(jwt), object(jwt))
                .stream().findFirst().orElseThrow(ApiException::forbidden);
    }
    public UUID tenant(Jwt jwt) { return identifier(jwt, "tid"); }
    public UUID object(Jwt jwt) { return identifier(jwt, "oid"); }
    private UUID identifier(Jwt jwt, String claim) {
        try { return UUID.fromString(jwt.getClaimAsString(claim)); }
        catch (IllegalArgumentException | NullPointerException ex) { throw ApiException.forbidden(); }
    }
    public void link(UUID tenant, UUID object, UUID member) {
        jdbc.update("insert into nite_connect.identity_accounts(tenant_id,object_id,member_id) values (?,?,?)", tenant, object, member);
    }
    public boolean hasIdentity(UUID member) {
        return Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from nite_connect.identity_accounts where member_id=?)", Boolean.class, member));
    }
    public boolean identityExists(UUID tenant, UUID object) {
        return Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from nite_connect.identity_accounts where tenant_id=? and object_id=?)", Boolean.class, tenant, object));
    }
    public Optional<UUID> memberForIdentity(UUID tenant, UUID object) {
        return jdbc.query("select member_id from nite_connect.identity_accounts where tenant_id=? and object_id=?",
                (rs, row) -> rs.getObject(1, UUID.class), tenant, object).stream().findFirst();
    }
    public boolean isEmpty() { return jdbc.queryForObject("select count(*) from nite_connect.identity_accounts", Long.class) == 0; }
}
