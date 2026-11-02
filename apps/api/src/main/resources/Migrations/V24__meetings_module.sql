CREATE TABLE nite_connect.meetings (
    id uuid PRIMARY KEY,
    organizer_member_id uuid NOT NULL REFERENCES nite_connect.members(id) ON DELETE RESTRICT,
    mode varchar(16) NOT NULL CHECK (mode IN ('IMMEDIATE', 'SCHEDULED')),
    title varchar(200) NOT NULL CHECK (length(trim(title)) > 0),
    status varchar(32) NOT NULL DEFAULT 'CRIACAO_PENDENTE'
        CHECK (status IN ('CRIACAO_PENDENTE', 'AGENDADA', 'SINCRONIZACAO_PENDENTE', 'CANCELADA', 'FALHA_PROVEDOR')),
    starts_at timestamptz NOT NULL,
    planned_duration_minutes integer NOT NULL CHECK (planned_duration_minutes > 0),
    planned_ends_at timestamptz NOT NULL,
    actual_starts_at timestamptz,
    actual_ends_at timestamptz,
    actual_duration_seconds bigint CHECK (actual_duration_seconds IS NULL OR actual_duration_seconds >= 0),
    graph_event_id varchar(512),
    graph_online_meeting_id varchar(512),
    graph_change_key varchar(512),
    join_url text,
    last_provider_error_code varchar(100),
    version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (planned_ends_at = starts_at + planned_duration_minutes * interval '1 minute'),
    CHECK (actual_ends_at IS NULL OR actual_starts_at IS NULL OR actual_ends_at >= actual_starts_at),
    CHECK (status <> 'AGENDADA' OR (graph_event_id IS NOT NULL AND join_url IS NOT NULL))
);
CREATE UNIQUE INDEX meetings_graph_event_idx ON nite_connect.meetings(organizer_member_id, graph_event_id)
    WHERE graph_event_id IS NOT NULL;
CREATE INDEX meetings_organizer_schedule_idx ON nite_connect.meetings(organizer_member_id, starts_at DESC, id);
CREATE INDEX meetings_schedule_idx ON nite_connect.meetings(starts_at, id) WHERE status='AGENDADA';

CREATE TABLE nite_connect.meeting_invites (
    id uuid PRIMARY KEY,
    meeting_id uuid NOT NULL REFERENCES nite_connect.meetings(id) ON DELETE RESTRICT,
    member_id uuid NOT NULL REFERENCES nite_connect.members(id) ON DELETE RESTRICT,
    internal_status varchar(16) NOT NULL DEFAULT 'PENDENTE'
        CHECK (internal_status IN ('PENDENTE', 'ACEITO', 'RECUSADO', 'REVOGADO')),
    internal_responded_at timestamptz,
    calendar_response_status varchar(32) NOT NULL DEFAULT 'NAO_SINCRONIZADO'
        CHECK (calendar_response_status IN ('NAO_SINCRONIZADO', 'NONE', 'TENTATIVELY_ACCEPTED', 'ACCEPTED', 'DECLINED', 'NOT_RESPONDED')),
    calendar_response_observed_at timestamptz,
    invited_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at timestamptz,
    UNIQUE (meeting_id, member_id),
    CHECK (internal_status NOT IN ('ACEITO', 'RECUSADO') OR internal_responded_at IS NOT NULL),
    CHECK ((internal_status = 'REVOGADO') = (revoked_at IS NOT NULL)),
    CHECK ((calendar_response_status = 'NAO_SINCRONIZADO') = (calendar_response_observed_at IS NULL))
);
CREATE INDEX meeting_invites_member_idx ON nite_connect.meeting_invites(member_id, meeting_id);

CREATE TABLE nite_connect.meeting_provider_operations (
    id uuid PRIMARY KEY,
    meeting_id uuid NOT NULL REFERENCES nite_connect.meetings(id) ON DELETE RESTRICT,
    organizer_member_id uuid NOT NULL REFERENCES nite_connect.members(id) ON DELETE RESTRICT,
    operation_type varchar(16) NOT NULL CHECK (operation_type IN ('CREATE', 'UPDATE', 'CANCEL')),
    idempotency_key varchar(128),
    request_hash char(64) NOT NULL,
    graph_transaction_id uuid NOT NULL UNIQUE,
    state varchar(28) NOT NULL DEFAULT 'PROCESSANDO'
        CHECK (state IN ('PROCESSANDO', 'CONFIRMADA', 'FALHA_PROVEDOR', 'RESULTADO_INDETERMINADO')),
    expected_version bigint,
    request_payload jsonb NOT NULL,
    attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    lease_until timestamptz,
    retry_after timestamptz,
    provider_error_code varchar(100),
    provider_http_status smallint,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at timestamptz
);
CREATE UNIQUE INDEX meeting_provider_idempotency_idx
    ON nite_connect.meeting_provider_operations(organizer_member_id, operation_type, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX meeting_provider_mutation_version_idx
    ON nite_connect.meeting_provider_operations(meeting_id, expected_version)
    WHERE operation_type IN ('UPDATE', 'CANCEL') AND state IN ('PENDENTE', 'RESULTADO_INDETERMINADO');
CREATE INDEX meeting_provider_retry_idx ON nite_connect.meeting_provider_operations(retry_after, id)
    WHERE state IN ('PENDENTE', 'RESULTADO_INDETERMINADO');

CREATE TABLE nite_connect.meeting_history (
    id uuid PRIMARY KEY,
    meeting_id uuid NOT NULL REFERENCES nite_connect.meetings(id) ON DELETE RESTRICT,
    actor_member_id uuid NOT NULL REFERENCES nite_connect.members(id) ON DELETE RESTRICT,
    action varchar(32) NOT NULL,
    meeting_version bigint NOT NULL CHECK (meeting_version > 0),
    before_snapshot jsonb,
    after_snapshot jsonb,
    occurred_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX meeting_history_meeting_idx ON nite_connect.meeting_history(meeting_id, occurred_at, id);
CREATE TRIGGER immutable_meeting_history BEFORE UPDATE OR DELETE ON nite_connect.meeting_history
    FOR EACH ROW EXECUTE FUNCTION nite_connect.reject_history_mutation();

CREATE TABLE nite_connect.meeting_notifications (
    id uuid PRIMARY KEY,
    recipient_member_id uuid NOT NULL REFERENCES nite_connect.members(id) ON DELETE RESTRICT,
    meeting_id uuid NOT NULL REFERENCES nite_connect.meetings(id) ON DELETE RESTRICT,
    notification_type varchar(40) NOT NULL
        CHECK (notification_type IN ('CONVITE_RECEBIDO', 'CONVITE_ACEITO', 'CONVITE_RECUSADO', 'REUNIAO_ALTERADA', 'REUNIAO_CANCELADA', 'HORARIO_DE_INICIO', 'FIM_PREVISTO', 'RELATORIO_DE_PRESENCA_DISPONIVEL')),
    source_key varchar(160) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at timestamptz,
    UNIQUE (recipient_member_id, source_key)
);
CREATE INDEX meeting_notifications_inbox_idx ON nite_connect.meeting_notifications(recipient_member_id, created_at DESC, id);

CREATE TABLE nite_connect.meeting_attendance_reports (
    id uuid PRIMARY KEY,
    meeting_id uuid NOT NULL UNIQUE REFERENCES nite_connect.meetings(id) ON DELETE RESTRICT,
    graph_report_id varchar(512),
    availability_status varchar(20) NOT NULL
        CHECK (availability_status IN ('PENDENTE', 'INDISPONIVEL', 'DISPONIVEL')),
    actual_starts_at timestamptz,
    actual_ends_at timestamptz,
    actual_duration_seconds bigint CHECK (actual_duration_seconds IS NULL OR actual_duration_seconds >= 0),
    retrieved_at timestamptz,
    CHECK (availability_status <> 'DISPONIVEL' OR retrieved_at IS NOT NULL)
);

CREATE TABLE nite_connect.meeting_attendance_records (
    id uuid PRIMARY KEY,
    report_id uuid NOT NULL REFERENCES nite_connect.meeting_attendance_reports(id) ON DELETE RESTRICT,
    graph_record_id varchar(512) NOT NULL,
    member_id uuid REFERENCES nite_connect.members(id) ON DELETE RESTRICT,
    attendance_seconds bigint CHECK (attendance_seconds IS NULL OR attendance_seconds >= 0),
    UNIQUE (report_id, graph_record_id)
);
CREATE INDEX meeting_attendance_member_idx ON nite_connect.meeting_attendance_records(member_id, report_id)
    WHERE member_id IS NOT NULL;

CREATE TABLE nite_connect.meeting_attendance_intervals (
    id uuid PRIMARY KEY,
    attendance_record_id uuid NOT NULL REFERENCES nite_connect.meeting_attendance_records(id) ON DELETE RESTRICT,
    joined_at timestamptz,
    left_at timestamptz,
    CHECK (left_at IS NULL OR joined_at IS NULL OR left_at >= joined_at)
);
