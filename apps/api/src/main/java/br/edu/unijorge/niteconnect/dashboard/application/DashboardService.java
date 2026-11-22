package br.edu.unijorge.niteconnect.dashboard.application;

import br.edu.unijorge.niteconnect.access.application.AccessService;
import br.edu.unijorge.niteconnect.dashboard.api.DashboardContracts.*;
import br.edu.unijorge.niteconnect.dashboard.infrastructure.DashboardRepository;
import br.edu.unijorge.niteconnect.shared.api.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
@Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
public class DashboardService {
    private final AccessService access;
    private final DashboardRepository repository;
    private final Clock clock;
    public DashboardService(AccessService access,DashboardRepository repository,Clock clock) {
        this.access=access;this.repository=repository;this.clock=clock;
    }
    public List<String> contexts(UUID actor) {
        access.requireActive(actor);
        return access.isAdministrator(actor)?List.of("PERSONAL","INSTITUTIONAL"):List.of("PERSONAL");
    }
    public Overview overview(UUID actor,boolean institutional,LocalDate from,LocalDate to) {
        if(institutional) access.requireAdministrator(actor); else access.requireActive(actor);
        if(from==null||to==null||from.isAfter(to)||to.equals(LocalDate.MAX)||ChronoUnit.DAYS.between(from,to)>365)
            throw ApiException.invalid("Informe um intervalo de até 366 dias inclusivos");
        Instant now=clock.instant();
        LocalDate today=LocalDate.ofInstant(now,clock.getZone());
        return repository.overview(actor,institutional,access.isAdministrator(actor),from,to,today,now,clock.getZone());
    }
}
