package br.edu.unijorge.niteconnect.activities.application;

import br.edu.unijorge.niteconnect.access.application.AccessService;
import br.edu.unijorge.niteconnect.activities.domain.ActivityStatus;
import br.edu.unijorge.niteconnect.activities.infrastructure.ActivityRepository;
import br.edu.unijorge.niteconnect.activities.infrastructure.EvidenceRepository;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

@Service
public class ActivityCapabilities {
    private final AccessService access;
    private final ActivityRepository activities;
    private final ActivityPolicy policy;
    private final EvidenceObjectStore storage;
    private final EvidenceRepository evidence;
    public ActivityCapabilities(AccessService access, ActivityRepository activities, ActivityPolicy policy, EvidenceObjectStore storage, EvidenceRepository evidence) {
        this.access=access;this.activities=activities;this.policy=policy;this.storage=storage;this.evidence=evidence;
    }
    @Transactional(readOnly=true) public EvidenceView evidence(UUID actor,UUID id,UUID evidenceId) {
        access.requireActive(actor);
        var activity=activities.require(id);policy.read(actor,activity);
        var item=evidence.require(evidenceId);
        if(!item.activityId().equals(id)) throw ApiException.notFound();
        return new EvidenceView(item.withdrawnAt()==null && allows(() -> policy.withdraw(actor,activity,item.authorId())));
    }
    @Transactional(readOnly=true) public Personal personal(UUID actor) {
        access.requireActive(actor);
        return new Personal(true);
    }
    @Transactional(readOnly=true) public View read(UUID actor, UUID id) {
        access.requireActive(actor);
        var activity=activities.require(id);
        boolean canDelete=activity.createdBy().equals(actor);
        try { policy.read(actor,activity); }
        catch(ApiException e) {
            if(canDelete && (e.status()==HttpStatus.FORBIDDEN || e.status()==HttpStatus.NOT_FOUND)) return View.deletionOnly();
            throw e;
        }
        boolean manage=allows(() -> policy.manage(actor,activity));
        boolean edit=manage && allows(() -> policy.editable(activity));
        boolean assign=allows(() -> policy.assign(actor,activity));
        boolean contribute=allows(() -> policy.contribute(actor,activity));
        List<ActivityStatus> transitions=Arrays.stream(ActivityStatus.values()).filter(activity.status()::canTransitionTo).filter(next -> {
            return allows(() -> policy.transition(actor,activity,next));
        }).toList();
        return new View(edit,edit,transitions,manage,assign,assign,contribute,contribute && storage.enabled(),canDelete);
    }
    private static boolean allows(Runnable check) {
        try { check.run();return true; }
        catch(ApiException e) {
            if(e.status()==HttpStatus.FORBIDDEN || e.status()==HttpStatus.CONFLICT) return false;
            throw e;
        }
    }
    public record Personal(boolean createIndependent) {}
    public record EvidenceView(boolean withdraw) {}
    public record View(boolean edit,boolean changePriority,List<ActivityStatus> transitions,boolean history,
                       boolean manageAssignees,boolean collaborate,boolean addEvidence,boolean upload,boolean canDelete) {
        private static View deletionOnly() { return new View(false,false,List.of(),false,false,false,false,false,true); }
    }
}
