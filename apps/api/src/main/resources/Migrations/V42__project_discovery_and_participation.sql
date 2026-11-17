ALTER TABLE nite_connect.projects
    ADD COLUMN accepting_members boolean NOT NULL DEFAULT false;

CREATE TABLE nite_connect.project_membership_requests (
    id uuid PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES nite_connect.projects(id),
    member_id uuid NOT NULL REFERENCES nite_connect.members(id),
    message varchar(2000),
    state varchar(16) NOT NULL DEFAULT 'PENDENTE'
        CHECK (state IN ('PENDENTE','APROVADA','REJEITADA','ENCERRADA')),
    requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    decided_at timestamptz,
    decided_by uuid REFERENCES nite_connect.members(id),
    decision_message varchar(2000),
    version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
    CHECK ((state='PENDENTE' AND decided_at IS NULL AND decided_by IS NULL)
        OR (state<>'PENDENTE' AND decided_at IS NOT NULL AND decided_by IS NOT NULL))
);
CREATE UNIQUE INDEX project_membership_request_pending_idx
    ON nite_connect.project_membership_requests(project_id,member_id) WHERE state='PENDENTE';
CREATE INDEX project_membership_requests_project_idx
    ON nite_connect.project_membership_requests(project_id,state,requested_at,id);
CREATE INDEX project_membership_requests_member_idx
    ON nite_connect.project_membership_requests(member_id,requested_at DESC,id);

CREATE TABLE nite_connect.project_interest_signals (
    id uuid PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES nite_connect.projects(id),
    member_id uuid NOT NULL REFERENCES nite_connect.members(id),
    message varchar(2000),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    withdrawn_at timestamptz
);
CREATE UNIQUE INDEX project_interest_active_idx
    ON nite_connect.project_interest_signals(project_id,member_id) WHERE withdrawn_at IS NULL;
CREATE INDEX project_interest_project_idx
    ON nite_connect.project_interest_signals(project_id,created_at,id) WHERE withdrawn_at IS NULL;

CREATE TABLE nite_connect.project_participation_notifications (
    id uuid PRIMARY KEY,
    source_key varchar(120) NOT NULL UNIQUE,
    recipient_id uuid NOT NULL REFERENCES nite_connect.members(id),
    project_id uuid NOT NULL REFERENCES nite_connect.projects(id),
    request_id uuid NOT NULL REFERENCES nite_connect.project_membership_requests(id),
    event_type varchar(32) NOT NULL CHECK (event_type IN ('SOLICITACAO_RECEBIDA','SOLICITACAO_APROVADA','SOLICITACAO_REJEITADA')),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    read_at timestamptz
);
CREATE INDEX project_participation_notifications_inbox_idx
    ON nite_connect.project_participation_notifications(recipient_id,created_at DESC,id);
