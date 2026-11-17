package br.edu.unijorge.niteconnect;

import br.edu.unijorge.niteconnect.activities.domain.*;
import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;

class Block03RulesTest {
    Activity activity(ActivityStatus status,LocalDate due) {
        return new Activity(UUID.randomUUID(),"Teste","Teste",null,status,due,UUID.randomUUID(),0,
                Instant.EPOCH,Instant.EPOCH,status==ActivityStatus.CONCLUIDA?Instant.EPOCH:null,UUID.randomUUID());
    }
    @Test void deadlineTodayIsNotOverdueAndTerminalStatesDoNotGeneratePendingWork() {
        LocalDate today=LocalDate.of(2026,10,16);
        assertThat(activity(ActivityStatus.PLANEJADA,today).overdue(today)).isFalse();
        assertThat(activity(ActivityStatus.EM_EXECUCAO,today.minusDays(1)).overdue(today)).isTrue();
        assertThat(activity(ActivityStatus.PLANEJADA,null).overdue(today)).isFalse();
        assertThat(activity(ActivityStatus.CONCLUIDA,today.minusDays(1)).overdue(today)).isFalse();
        assertThat(activity(ActivityStatus.CANCELADA,today.minusDays(1)).overdue(today)).isFalse();
    }
    @Test void routineStatusTransitionsAllowDirectCompletionAndRepeatedReopening() {
        assertThat(ActivityStatus.PLANEJADA.canTransitionTo(ActivityStatus.CONCLUIDA)).isTrue();
        assertThat(ActivityStatus.PLANEJADA.canTransitionTo(ActivityStatus.EM_EXECUCAO)).isTrue();
        assertThat(ActivityStatus.EM_EXECUCAO.canTransitionTo(ActivityStatus.PLANEJADA)).isTrue();
        assertThat(ActivityStatus.EM_EXECUCAO.canTransitionTo(ActivityStatus.CONCLUIDA)).isTrue();
        assertThat(ActivityStatus.CONCLUIDA.canTransitionTo(ActivityStatus.PLANEJADA)).isTrue();
        assertThat(ActivityStatus.CONCLUIDA.canTransitionTo(ActivityStatus.EM_EXECUCAO)).isTrue();
        assertThat(ActivityStatus.CANCELADA.canTransitionTo(ActivityStatus.EM_EXECUCAO)).isTrue();
        for(ActivityStatus s:ActivityStatus.values()) assertThat(s.canTransitionTo(s)).isFalse();
    }
}
