package br.edu.unijorge.niteconnect.activities.management.application;

import br.edu.unijorge.niteconnect.access.application.AccessService;
import br.edu.unijorge.niteconnect.access.application.ProjectAccess;
import br.edu.unijorge.niteconnect.activities.infrastructure.ActivityRepository.Filter;
import br.edu.unijorge.niteconnect.activities.management.api.ActivityManagementContracts.Item;
import br.edu.unijorge.niteconnect.activities.management.api.ActivityManagementContracts.Person;
import br.edu.unijorge.niteconnect.activities.management.api.ActivityManagementContracts.Result;
import br.edu.unijorge.niteconnect.activities.management.infrastructure.ActivityManagementRepository;
import br.edu.unijorge.niteconnect.members.application.MemberDirectory;
import br.edu.unijorge.niteconnect.shared.api.PageResult;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.util.UUID;
import java.util.stream.Stream;

@Service
@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
public class ActivityManagementService {
    private final ActivityManagementRepository repository;
    private final AccessService access;
    private final ProjectAccess projectAccess;
    private final Clock clock;
    private final MemberDirectory members;

    public ActivityManagementService(ActivityManagementRepository repository, AccessService access,
                                     ProjectAccess projectAccess, Clock clock, MemberDirectory members) {
        this.repository = repository;
        this.access = access;
        this.projectAccess = projectAccess;
        this.clock = clock;
        this.members = members;
    }

    public Result global(UUID actor, Filter filter, UUID memberId, int page, int size) {
        access.requireAdministrator(actor);
        if (filter.projectId() != null) projectAccess.requireRead(actor, filter.projectId());
        return query(filter, memberId, page, size);
    }

    public Result project(UUID actor, Filter filter, UUID memberId, int page, int size) {
        projectAccess.requireManage(actor, filter.projectId());
        return query(filter, memberId, page, size);
    }

    public PageResult<MemberDirectory.Candidate> globalPeople(UUID actor, UUID project, UUID selected, String query, int page, int size) {
        access.requireAdministrator(actor);
        if (project != null) projectAccess.requireRead(actor, project);
        return members.managementCandidates(project, selected, query, page, size);
    }

    public PageResult<MemberDirectory.Candidate> people(UUID actor, UUID project, UUID selected, String query, int page, int size) {
        projectAccess.requireManage(actor, project);
        return members.managementCandidates(project, selected, query, page, size);
    }

    private Result query(Filter filter, UUID memberId, int page, int size) {
        PageResult.validate(page, size);
        filter.validate();
        var result = repository.query(filter, memberId, LocalDate.now(clock), page, size);
        var ids = result.items().stream()
                .flatMap(item -> Stream.concat(Stream.of(item.createdById(), item.primaryExecutorId()), item.collaboratorIds().stream()))
                .distinct().toList();
        var names = members.names(ids);
        var items = result.items().stream().map(item -> new Item(item.activityId(), item.title(), item.projectId(), item.projectTitle(), item.projectStatus(),
                item.planningId(), item.planningTitle(), item.status(), item.priority(), item.startOn(), item.dueOn(),
                item.createdById(), names.get(item.createdById()), item.primaryExecutorId(), names.get(item.primaryExecutorId()),
                item.collaboratorIds(), item.collaboratorIds().stream().map(id -> new Person(id, names.get(id))).toList(),
                item.linkKinds(), item.activeEvidenceCount(), item.createdAt(), item.completedAt(), item.overdue(), item.attentionRequired())).toList();
        return new Result(items, result.page(), result.size(), result.total(), result.asOfDate(), result.summary());
    }
}
