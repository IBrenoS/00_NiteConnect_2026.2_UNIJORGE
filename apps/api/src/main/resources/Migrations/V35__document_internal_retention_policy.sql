-- Internal NITE policy governance. Existing policy rows and purge history remain intact.
ALTER TABLE nite_connect.documents DROP CONSTRAINT document_protection_check;
ALTER TABLE nite_connect.documents ADD CONSTRAINT document_protection_check
 CHECK (protection IN ('NONE','OFFICIAL','ACADEMIC','ACADEMIC_NITE','ADMINISTRATIVE','UNKNOWN'));
ALTER TABLE nite_connect.document_folders DROP CONSTRAINT folder_protection_check;
ALTER TABLE nite_connect.document_folders ADD CONSTRAINT folder_protection_check
 CHECK (protection IN ('NONE','OFFICIAL','ACADEMIC','ACADEMIC_NITE','ADMINISTRATIVE','UNKNOWN'));

ALTER TABLE nite_connect.document_retention_policies
  ADD COLUMN creation_reason varchar(1000),
  ADD COLUMN approval_reason varchar(1000),
  ADD COLUMN supersedes_id uuid REFERENCES nite_connect.document_retention_policies(id);

CREATE TABLE nite_connect.document_retention_policy_events (
 id uuid PRIMARY KEY,
 policy_id uuid NOT NULL REFERENCES nite_connect.document_retention_policies(id),
 actor_id uuid NOT NULL REFERENCES nite_connect.members(id),
 action varchar(24) NOT NULL CHECK (action IN ('CREATED','APPROVED','SUPERSEDED')),
 reason varchar(1000) NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER document_retention_policy_events_immutable BEFORE UPDATE OR DELETE
 ON nite_connect.document_retention_policy_events FOR EACH ROW EXECUTE FUNCTION nite_connect.document_immutable_row();

CREATE TABLE nite_connect.document_project_action_requests (
 id uuid PRIMARY KEY,
 project_id uuid NOT NULL REFERENCES nite_connect.projects(id),
 resource_id uuid NOT NULL,
 resource_type varchar(12) NOT NULL CHECK (resource_type IN ('DOCUMENT','FOLDER')),
 action varchar(12) NOT NULL CHECK (action IN ('TRASH','PURGE')),
 requested_by uuid NOT NULL REFERENCES nite_connect.members(id),
 reason varchar(1000) NOT NULL CHECK (length(btrim(reason))>0),
 status varchar(12) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
 requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 decided_by uuid REFERENCES nite_connect.members(id),
 decided_at timestamptz,
 decision_reason varchar(1000),
 purge_operation_id uuid REFERENCES nite_connect.document_purge_operations(id),
 CHECK ((status='PENDING' AND decided_by IS NULL AND decided_at IS NULL)
    OR (status<>'PENDING' AND decided_by IS NOT NULL AND decided_at IS NOT NULL AND decision_reason IS NOT NULL))
);
CREATE INDEX document_project_action_requests_pending_idx
 ON nite_connect.document_project_action_requests(status,requested_at,id);

ALTER TABLE nite_connect.document_purge_operations DROP CONSTRAINT document_purge_operations_operation_type_check;
ALTER TABLE nite_connect.document_purge_operations ADD CONSTRAINT document_purge_operations_operation_type_check
 CHECK (operation_type IN ('ITEM','EMPTY','AUTO'));
ALTER TABLE nite_connect.document_purge_operations ADD COLUMN initiated_by_system boolean NOT NULL DEFAULT false;
CREATE TABLE nite_connect.document_purge_scan_state (
 id boolean PRIMARY KEY DEFAULT true CHECK (id),
 last_deleted_at timestamptz NOT NULL DEFAULT '1970-01-01T00:00:00Z',
 last_resource_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO nite_connect.document_purge_scan_state(id) VALUES (true);

CREATE TABLE nite_connect.document_purge_activation (
 id boolean PRIMARY KEY DEFAULT true CHECK (id),
 enabled boolean NOT NULL DEFAULT false,
 versioning_verified boolean NOT NULL DEFAULT false,
 backup_verified boolean NOT NULL DEFAULT false,
 reconciliation_verified boolean NOT NULL DEFAULT false,
 permissions_verified boolean NOT NULL DEFAULT false,
 recovery_verified boolean NOT NULL DEFAULT false,
 changed_by uuid REFERENCES nite_connect.members(id),
 changed_at timestamptz,
 reason varchar(1000),
 CHECK (NOT enabled OR (versioning_verified AND backup_verified AND reconciliation_verified
   AND permissions_verified AND recovery_verified AND changed_by IS NOT NULL AND changed_at IS NOT NULL))
);
INSERT INTO nite_connect.document_purge_activation(id) VALUES (true);
CREATE TABLE nite_connect.document_purge_activation_events (
 id uuid PRIMARY KEY,
 actor_id uuid NOT NULL REFERENCES nite_connect.members(id),
 enabled boolean NOT NULL,
 reason varchar(1000) NOT NULL,
 versioning_verified boolean NOT NULL,
 backup_verified boolean NOT NULL,
 reconciliation_verified boolean NOT NULL,
 permissions_verified boolean NOT NULL,
 recovery_verified boolean NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER document_purge_activation_events_immutable BEFORE UPDATE OR DELETE
 ON nite_connect.document_purge_activation_events FOR EACH ROW EXECUTE FUNCTION nite_connect.document_immutable_row();
