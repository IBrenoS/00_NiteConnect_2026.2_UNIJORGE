package br.edu.unijorge.niteconnect.activities.application;

import br.edu.unijorge.niteconnect.access.application.AccessService;
import br.edu.unijorge.niteconnect.access.application.ProjectAccess;
import br.edu.unijorge.niteconnect.activities.domain.Activity;
import br.edu.unijorge.niteconnect.activities.domain.ActivityStatus;
import br.edu.unijorge.niteconnect.activities.infrastructure.ActivityRepository;
import br.edu.unijorge.niteconnect.projects.application.ProjectDirectory;
import br.edu.unijorge.niteconnect.projects.domain.ProjectStatus;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import org.springframework.stereotype.Component;
import java.util.UUID;

@Component
public class ActivityPolicy {
    private final AccessService access;
    private final ProjectAccess permissions;
    private final ProjectDirectory projects;
    private final ActivityRepository activities;
    public ActivityPolicy(AccessService access,ProjectAccess permissions,ProjectDirectory projects,ActivityRepository activities) {
        this.access=access;this.permissions=permissions;this.projects=projects;this.activities=activities;
    }
    public void read(UUID actor,Activity a) {
        access.requireActive(actor);
        if(a.projectId()!=null) permissions.requireRead(actor,a.projectId());
        else if(!access.isAdministrator(actor) && !a.createdBy().equals(actor) && activities.assigned(a.id(),actor).isEmpty()) throw ApiException.notFound();
    }
    public boolean manages(UUID actor,Activity a) {
        return access.isAdministrator(actor) || (a.projectId()==null ? activities.personalOwner(a,actor)
                : actor.equals(projects.leader(a.projectId())) && projects.participates(a.projectId(),actor));
    }
    public void manage(UUID actor,Activity a) { read(actor,a);if(!manages(actor,a)) throw ApiException.forbidden(); }
    public void eligible(UUID member,UUID project) {
        access.requireActive(member);
        if(project!=null && !projects.participates(project,member)) throw ApiException.conflict("Integrante sem participação vigente no projeto");
    }
    public void context(Activity a,boolean execution) {
        if(a.projectId()==null) return;
        ProjectStatus status=projects.require(a.projectId()).status();
        if(status==ProjectStatus.CONCLUIDO || execution && status!=ProjectStatus.ATIVO) throw ApiException.conflict("Estado do projeto impede esta operação");
    }
    public void editable(Activity a) { context(a,false);if(a.status().terminal()) throw ApiException.conflict("Reabra a atividade antes de alterá-la"); }
    public void contribute(UUID actor,Activity a) {
        read(actor,a); context(a,true);
        if(a.status().terminal()) throw ApiException.conflict("Reabra a atividade antes de contribuir");
        if(!manages(actor,a) && activities.assigned(a.id(),actor).isEmpty()) throw ApiException.forbidden();
        if(!manages(actor,a)) eligible(actor,a.projectId());
    }
    public void execute(UUID actor,Activity a) {
        read(actor,a);context(a,true);
        if(!manages(actor,a) && !a.primaryExecutorId().equals(actor)) throw ApiException.forbidden();
        if(!manages(actor,a)) eligible(actor,a.projectId());
    }
    public void transition(UUID actor,Activity a,ActivityStatus next) {
        if(next==ActivityStatus.CANCELADA || a.status().terminal()) { manage(actor,a);context(a,a.status().terminal()); }
        else execute(actor,a);
    }
    public void assign(UUID actor,Activity a) {
        read(actor,a);editable(a);
        if(a.projectId()==null) {
            if(!access.isAdministrator(actor) && !a.createdBy().equals(actor)) throw ApiException.forbidden();
        } else manage(actor,a);
    }
    public void withdraw(UUID actor,Activity a,UUID author) {
        context(a,false);
        if(!manages(actor,a)) {
            contribute(actor,a);
            if(!actor.equals(author)) throw ApiException.forbidden();
        }
    }
}
