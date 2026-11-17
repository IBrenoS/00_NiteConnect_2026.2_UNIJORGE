package br.edu.unijorge.niteconnect.activities.domain;

public enum ActivityStatus {
    PLANEJADA, EM_EXECUCAO, CONCLUIDA, CANCELADA;

    public boolean terminal() { return this == CONCLUIDA || this == CANCELADA; }
    public boolean canTransitionTo(ActivityStatus next) {
        if (next == null) return false;
        return switch (this) {
            case PLANEJADA -> next == EM_EXECUCAO || next == CONCLUIDA || next == CANCELADA;
            case EM_EXECUCAO -> next == PLANEJADA || next == CONCLUIDA || next == CANCELADA;
            case CONCLUIDA -> next == PLANEJADA || next == EM_EXECUCAO;
            case CANCELADA -> next == EM_EXECUCAO;
        };
    }
}
