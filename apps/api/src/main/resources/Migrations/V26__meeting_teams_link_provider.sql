ALTER TABLE nite_connect.meetings
    ADD COLUMN provider varchar(16) NOT NULL DEFAULT 'GRAPH',
    ADD COLUMN provider_state varchar(40);

DO $$
DECLARE
    constraint_row record;
BEGIN
    FOR constraint_row IN
        SELECT conname
          FROM pg_constraint
         WHERE conrelid = 'nite_connect.meetings'::regclass
           AND contype = 'c'
           AND pg_get_constraintdef(oid) LIKE '%CRIACAO_PENDENTE%'
    LOOP
        EXECUTE format('ALTER TABLE nite_connect.meetings DROP CONSTRAINT %I', constraint_row.conname);
    END LOOP;

    FOR constraint_row IN
        SELECT conname
          FROM pg_constraint
         WHERE conrelid = 'nite_connect.meetings'::regclass
           AND contype = 'c'
           AND pg_get_constraintdef(oid) LIKE '%graph_event_id%'
    LOOP
        EXECUTE format('ALTER TABLE nite_connect.meetings DROP CONSTRAINT %I', constraint_row.conname);
    END LOOP;
END $$;

ALTER TABLE nite_connect.meetings
    ADD CONSTRAINT meetings_provider_check
        CHECK (provider IN ('GRAPH', 'TEAMS_LINK')),
    ADD CONSTRAINT meetings_provider_state_check
        CHECK ((provider = 'GRAPH' AND provider_state IS NULL)
            OR (provider = 'TEAMS_LINK' AND provider_state IS NOT NULL AND provider_state IN (
                'AGUARDANDO_CRIACAO_NO_TEAMS',
                'LINK_CONFIRMADO_PELO_ORGANIZADOR',
                'ATUALIZACAO_PENDENTE_NO_TEAMS',
                'CANCELAMENTO_NAO_SINCRONIZADO'
            ))),
    ADD CONSTRAINT meetings_status_check
        CHECK (status IN ('CRIACAO_PENDENTE', 'AGUARDANDO_TEAMS', 'AGENDADA',
                          'SINCRONIZACAO_PENDENTE', 'CANCELADA', 'FALHA_PROVEDOR')),
    ADD CONSTRAINT meetings_confirmation_check
        CHECK (status <> 'AGENDADA'
            OR (join_url IS NOT NULL AND
                ((provider = 'GRAPH' AND graph_event_id IS NOT NULL)
                    OR (provider = 'TEAMS_LINK' AND provider_state = 'LINK_CONFIRMADO_PELO_ORGANIZADOR'))));

ALTER TABLE nite_connect.meeting_provider_operations
    ALTER COLUMN graph_transaction_id DROP NOT NULL;

ALTER TABLE nite_connect.meeting_provider_operations
    DROP CONSTRAINT meeting_provider_operations_graph_transaction_id_key;

CREATE UNIQUE INDEX meeting_provider_graph_transaction_idx
    ON nite_connect.meeting_provider_operations(graph_transaction_id)
    WHERE graph_transaction_id IS NOT NULL;

CREATE INDEX meetings_provider_state_idx
    ON nite_connect.meetings(provider, provider_state, status, starts_at);
