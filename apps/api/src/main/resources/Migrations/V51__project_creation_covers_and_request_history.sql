ALTER TABLE nite_connect.projects
    ADD COLUMN cover_object_id uuid,
    ADD COLUMN cover_content_type varchar(32),
    ADD CONSTRAINT project_cover_pair_check CHECK (
        (cover_object_id IS NULL AND cover_content_type IS NULL)
        OR (cover_object_id IS NOT NULL AND cover_content_type IN ('image/jpeg','image/png'))
    );

CREATE TABLE nite_connect.project_membership_request_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id uuid NOT NULL REFERENCES nite_connect.project_membership_requests(id),
    actor_id uuid NOT NULL REFERENCES nite_connect.members(id),
    event_type varchar(32) NOT NULL CHECK (event_type IN ('SOLICITACAO_CRIADA','APROVADA','REJEITADA','DESISTIDA','ENCERRADA')),
    from_state varchar(16) CHECK (from_state IN ('PENDENTE','APROVADA','REJEITADA','ENCERRADA')),
    to_state varchar(16) NOT NULL CHECK (to_state IN ('PENDENTE','APROVADA','REJEITADA','ENCERRADA')),
    message varchar(2000),
    occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX project_membership_request_events_idx
    ON nite_connect.project_membership_request_events(request_id,occurred_at,id);
CREATE TRIGGER immutable_project_membership_request_events
    BEFORE UPDATE OR DELETE ON nite_connect.project_membership_request_events
    FOR EACH ROW EXECUTE FUNCTION nite_connect.reject_history_mutation();

INSERT INTO nite_connect.project_membership_request_events(request_id,actor_id,event_type,from_state,to_state,message)
SELECT id,member_id,'SOLICITACAO_CRIADA',null,'PENDENTE',message
FROM nite_connect.project_membership_requests;
INSERT INTO nite_connect.project_membership_request_events(request_id,actor_id,event_type,from_state,to_state,message)
SELECT id,decided_by,
       CASE WHEN state='APROVADA' THEN 'APROVADA' WHEN state='REJEITADA' THEN 'REJEITADA' ELSE 'ENCERRADA' END,
       'PENDENTE',state,decision_message
FROM nite_connect.project_membership_requests WHERE state<>'PENDENTE';
