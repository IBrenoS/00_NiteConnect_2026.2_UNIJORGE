CREATE TABLE nite_connect.document_automation_rules (
 id uuid PRIMARY KEY,
 owner_id uuid NOT NULL REFERENCES nite_connect.members(id),
 target_type varchar(12) NOT NULL CHECK (target_type IN ('FOLDER','DOCUMENT')),
 target_id uuid NOT NULL,
 event_type varchar(32) NOT NULL CHECK (event_type IN ('NEW_FILE_IN_FOLDER','FILE_REQUEST_FULFILLED','DOCUMENT_SHARED_WITH_ME')),
 enabled boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 deleted_at timestamptz
);
CREATE INDEX document_automation_rules_owner_idx ON nite_connect.document_automation_rules(owner_id,created_at DESC) WHERE deleted_at IS NULL;
CREATE TABLE nite_connect.document_automation_deliveries (
 id uuid PRIMARY KEY,
 rule_id uuid NOT NULL REFERENCES nite_connect.document_automation_rules(id),
 event_key varchar(180) NOT NULL UNIQUE,
 event_type varchar(32) NOT NULL,
 resource_id uuid NOT NULL,
 recipient_id uuid NOT NULL REFERENCES nite_connect.members(id),
 state varchar(12) NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','DELIVERED','SKIPPED','FAILED')),
 attempts integer NOT NULL DEFAULT 0,
 error_code varchar(48),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 completed_at timestamptz
);
CREATE TABLE nite_connect.document_notifications (
 id uuid PRIMARY KEY,
 delivery_id uuid NOT NULL UNIQUE REFERENCES nite_connect.document_automation_deliveries(id),
 recipient_id uuid NOT NULL REFERENCES nite_connect.members(id),
 event_type varchar(32) NOT NULL,
 resource_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 read_at timestamptz
);
