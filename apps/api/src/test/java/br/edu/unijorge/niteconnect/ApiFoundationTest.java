package br.edu.unijorge.niteconnect;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.context.ApplicationContext;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Testcontainers
@AutoConfigureMockMvc
@SpringBootTest(properties = {
        "nite.entra.enabled=false",
        "nite.documents.enabled=false"
})
class ApiFoundationTest {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:17-alpine");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ApplicationContext context;

    @Test
    void noLocalPasswordAuthenticationIsProvisioned() {
        assertThat(context.getBeansOfType(UserDetailsService.class)).isEmpty();
    }

    @Test
    void healthEndpointIsPublic() throws Exception {
        mockMvc.perform(get("/actuator/health"))
                .andExpect(status().isOk());
    }

    @Test
    void allUnimplementedRoutesAreDenied() throws Exception {
        mockMvc.perform(get("/api/administracao"))
                .andExpect(status().isForbidden());
    }

    @Test
    void disabledEntraDeniesEvenAnAuthenticatedJwtPrincipal() throws Exception {
        mockMvc.perform(get("/api/v1/me").with(jwt().jwt(token -> token
                        .claim("tid", "11111111-1111-4111-8111-111111111111")
                        .claim("oid", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"))))
                .andExpect(status().isForbidden())
                .andExpect(result -> assertThat(result.getHandler()).isNull());
    }

    @Test
    void initialMigrationCreatesApplicationSchema() {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name = 'nite_connect'",
                Integer.class);
        assertThat(count).isEqualTo(1);
    }
}
