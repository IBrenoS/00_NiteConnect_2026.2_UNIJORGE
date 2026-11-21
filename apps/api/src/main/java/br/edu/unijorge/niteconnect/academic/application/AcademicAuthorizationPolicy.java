package br.edu.unijorge.niteconnect.academic.application;

import java.util.UUID;
import org.springframework.stereotype.Component;
import br.edu.unijorge.niteconnect.access.application.AccessService;
import br.edu.unijorge.niteconnect.access.domain.GlobalRole;
import br.edu.unijorge.niteconnect.shared.api.ApiException;

@Component
public class AcademicAuthorizationPolicy {
    private final AccessService access;
    public AcademicAuthorizationPolicy(AccessService access) { this.access=access; }
    public void requireCoordinator(UUID actor) {
        access.requireActive(actor);
        if(!access.institutionalRoles(actor).contains(GlobalRole.COORDENADOR)) throw ApiException.forbidden();
    }
    public void requireAdministrator(UUID actor) { access.requireAdministrator(actor); }
    public void requireActive(UUID actor) { access.requireActive(actor); }
    public void requireRead(UUID actor,UUID member) {
        access.requireActive(actor);
        if(!actor.equals(member) && !access.isAdministrator(actor)) throw ApiException.forbidden();
    }
    public boolean isCoordinator(UUID actor) { access.requireActive(actor);return access.institutionalRoles(actor).contains(GlobalRole.COORDENADOR); }
}
