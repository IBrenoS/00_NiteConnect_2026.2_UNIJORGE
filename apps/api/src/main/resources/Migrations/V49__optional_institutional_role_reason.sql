-- B08.6B: role reasons may be omitted; all other audit reasons remain required.
ALTER TABLE nite_connect.role_assignments ALTER COLUMN reason DROP NOT NULL;
ALTER TABLE nite_connect.audit_events ALTER COLUMN reason DROP NOT NULL;
ALTER TABLE nite_connect.audit_events ADD CONSTRAINT audit_reason_required_except_roles CHECK (
    reason IS NOT NULL OR (entity_type = 'MEMBER' AND action IN ('ROLE_GRANTED', 'ROLE_REVOKED'))
);
