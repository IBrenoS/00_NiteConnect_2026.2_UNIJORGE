-- Operational project records remain immutable and keep their timestamps and actors.
-- Drop only the known reason checks from V3; preserve unrelated integrity constraints.
ALTER TABLE nite_connect.project_memberships
    DROP CONSTRAINT project_memberships_check;
ALTER TABLE nite_connect.project_leadership_history
    DROP CONSTRAINT project_leadership_history_check;

ALTER TABLE nite_connect.project_memberships
    ALTER COLUMN start_reason DROP NOT NULL,
    ADD CONSTRAINT project_memberships_period_integrity_check CHECK (
        (ended_at IS NULL AND ended_by IS NULL)
        OR (ended_at IS NOT NULL AND ended_at >= started_at AND ended_by IS NOT NULL)
    );

ALTER TABLE nite_connect.project_leadership_history
    ALTER COLUMN start_reason DROP NOT NULL,
    ADD CONSTRAINT project_leadership_period_integrity_check CHECK (
        (ended_at IS NULL AND ended_by IS NULL)
        OR (ended_at IS NOT NULL AND ended_at >= started_at AND ended_by IS NOT NULL)
    );

ALTER TABLE nite_connect.project_status_history
    ALTER COLUMN reason DROP NOT NULL;

ALTER TABLE nite_connect.audit_events
    DROP CONSTRAINT audit_reason_required_except_roles,
    ADD CONSTRAINT audit_reason_required_except_roles_and_project_admin CHECK (
        reason IS NOT NULL
        OR (entity_type = 'MEMBER' AND action IN ('ROLE_GRANTED', 'ROLE_REVOKED'))
        OR (entity_type = 'PROJECT' AND action IN (
            'PROJECT_UPDATED', 'PROJECT_STATUS_CHANGED', 'PROJECT_MEMBER_JOINED',
            'PROJECT_MEMBER_LEFT', 'PROJECT_LEADERSHIP_TRANSFERRED', 'PROJECT_DELETED'
        ))
    );
