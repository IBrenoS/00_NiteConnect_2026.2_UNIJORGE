ALTER TABLE nite_connect.meeting_invites
    ADD COLUMN version bigint NOT NULL DEFAULT 1 CHECK (version > 0);

DROP INDEX nite_connect.meeting_provider_mutation_version_idx;
CREATE UNIQUE INDEX meeting_provider_mutation_version_idx
    ON nite_connect.meeting_provider_operations(meeting_id, expected_version)
    WHERE operation_type IN ('UPDATE', 'CANCEL') AND state IN ('PROCESSANDO', 'RESULTADO_INDETERMINADO');

DROP INDEX nite_connect.meeting_provider_retry_idx;
CREATE INDEX meeting_provider_retry_idx ON nite_connect.meeting_provider_operations(retry_after, id)
    WHERE state='RESULTADO_INDETERMINADO';
