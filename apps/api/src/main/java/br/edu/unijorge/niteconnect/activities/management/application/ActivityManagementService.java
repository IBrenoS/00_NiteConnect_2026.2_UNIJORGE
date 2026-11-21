package br.edu.unijorge.niteconnect.activities.management.application;

import br.edu.unijorge.niteconnect.access.application.AccessService;
import br.edu.unijorge.niteconnect.access.application.ProjectAccess;
import br.edu.unijorge.niteconnect.activities.infrastructure.ActivityRepository.Filter;
import br.edu.unijorge.niteconnect.activities.management.api.ActivityManagementContracts.Result;
import br.edu.unijorge.niteconnect.activities.management.infrastructure.ActivityManagementRepository;
import br.edu.unijorge.niteconnect.shared.api.PageResult;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.util.UUID;

@Service
@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
public class ActivityManagementService {
    private final ActivityManagementRepository repository;
    private final AccessService access;
    private final ProjectAccess projectAccess;
    private final Clock clock;

    public ActivityManagementService(ActivityManagementRepository repository, AccessService access,
                                     ProjectAccess projectAccess, Clock clock) {
        this.repository = repository;
        this.access = access;
        this.projectAccess = projectAccess;
        this.clock = clock;
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

    private Result query(Filter filter, UUID memberId, int page, int size) {
        PageResult.validate(page, size);
        filter.validate();
        return repository.query(filter, memberId, LocalDate.now(clock), page, size);
    }
}
