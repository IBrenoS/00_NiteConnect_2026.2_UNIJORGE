-- B05.7D: explicit rule scopes, durable retries and immutable rule audit.
ALTER TABLE nite_connect.document_automation_rules
    DROP CONSTRAINT document_automation_rules_target_type_check;
ALTER TABLE nite_connect.document_automation_rules
    ADD CONSTRAINT document_automation_rules_target_type_check
    CHECK (target_type IN ('FOLDER','DOCUMENT','REQUEST','SELF'));
CREATE UNIQUE INDEX document_automation_rules_active_unique_idx
    ON nite_connect.document_automation_rules(owner_id,event_type,target_type,target_id)
    WHERE deleted_at IS NULL;

ALTER TABLE nite_connect.document_automation_deliveries
    ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp();
ALTER TABLE nite_connect.document_automation_deliveries
    ADD COLUMN resource_type varchar(12) CHECK (resource_type IN ('DOCUMENT','FOLDER'));
ALTER TABLE nite_connect.document_notifications
    ADD COLUMN resource_type varchar(12) CHECK (resource_type IN ('DOCUMENT','FOLDER'));
CREATE INDEX document_automation_deliveries_retry_idx
    ON nite_connect.document_automation_deliveries(next_attempt_at,id)
    WHERE state IN ('PENDING','FAILED');
CREATE INDEX document_automation_deliveries_rule_history_idx
    ON nite_connect.document_automation_deliveries(rule_id,created_at DESC,id DESC);
CREATE INDEX document_notifications_recipient_idx
    ON nite_connect.document_notifications(recipient_id,created_at DESC,id DESC);

CREATE TABLE nite_connect.document_automation_rule_events (
    id uuid PRIMARY KEY,
    rule_id uuid NOT NULL REFERENCES nite_connect.document_automation_rules(id),
    actor_id uuid NOT NULL REFERENCES nite_connect.members(id),
    action varchar(12) NOT NULL CHECK (action IN ('CREATED','ENABLED','DISABLED','REMOVED')),
    occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX document_automation_rule_events_rule_idx
    ON nite_connect.document_automation_rule_events(rule_id,occurred_at DESC,id DESC);
CREATE TRIGGER document_automation_rule_events_immutable
    BEFORE UPDATE OR DELETE ON nite_connect.document_automation_rule_events
    FOR EACH ROW EXECUTE FUNCTION nite_connect.document_immutable_row();

CREATE INDEX document_events_created_scan_idx
    ON nite_connect.document_events(occurred_at,id) WHERE action='DOCUMENT_CREATED';
CREATE INDEX document_request_uploaded_scan_idx
    ON nite_connect.document_file_request_events(occurred_at,id) WHERE action='UPLOADED';
CREATE INDEX document_share_granted_scan_idx
    ON nite_connect.document_share_events(occurred_at,id) WHERE action='SHARE_GRANTED';
