ALTER TABLE nite_connect.projects
    ADD COLUMN deleted_at timestamptz,
    ADD COLUMN deleted_by uuid REFERENCES nite_connect.members(id);

ALTER TABLE nite_connect.projects
    ADD CONSTRAINT projects_deletion_metadata_consistent
    CHECK ((deleted_at IS NULL) = (deleted_by IS NULL));

CREATE INDEX projects_active_title_idx ON nite_connect.projects(title, id) WHERE deleted_at IS NULL;

ALTER TABLE nite_connect.audit_events
    DROP CONSTRAINT audit_reason_required_except_roles;
ALTER TABLE nite_connect.audit_events
    ADD CONSTRAINT audit_reason_required_except_roles CHECK (
        reason IS NOT NULL OR (entity_type = 'MEMBER' AND action IN ('ROLE_GRANTED', 'ROLE_REVOKED'))
        OR (entity_type = 'PROJECT' AND action IN ('PROJECT_UPDATED', 'PROJECT_DELETED'))
    );
