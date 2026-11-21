package br.edu.unijorge.niteconnect.access.domain;

/** Persisted institutional roles. The historical type name does not imply global authority. */
public enum GlobalRole {
    COORDENADOR, GESTOR_GERAL, GESTOR_PROJETO;

    public boolean grantsGlobalAdministration() {
        return this == COORDENADOR || this == GESTOR_GERAL;
    }

    public boolean qualifiesForProjectLeadership() {
        return this == GESTOR_PROJETO || grantsGlobalAdministration();
    }
}
