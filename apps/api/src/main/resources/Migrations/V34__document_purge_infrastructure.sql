-- 05.6.3A: durable preparation for irreversible disposal. No policy is seeded as approved.
CREATE TABLE nite_connect.document_retention_policies (
 id uuid PRIMARY KEY,
 policy_key varchar(80) NOT NULL,
 version integer NOT NULL CHECK (version > 0),
 scope varchar(24) NOT NULL CHECK (scope IN ('PERSONAL','PROJECT','INSTITUTIONAL','GLOBAL')),
 minimum_trash_days integer CHECK (minimum_trash_days IS NULL OR minimum_trash_days >= 0),
 enabled boolean NOT NULL DEFAULT false,
 approved_by uuid REFERENCES nite_connect.members(id),
 approved_at timestamptz,
 effective_from timestamptz,
 effective_until timestamptz,
 policy_hash char(64) NOT NULL,
 created_by uuid NOT NULL REFERENCES nite_connect.members(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK ((enabled AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND effective_from IS NOT NULL)
     OR NOT enabled),
 CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until > effective_from),
 UNIQUE (policy_key,version)
);
CREATE UNIQUE INDEX document_retention_one_effective_policy_idx
 ON nite_connect.document_retention_policies(policy_key)
 WHERE enabled AND effective_until IS NULL;

CREATE TABLE nite_connect.document_purge_operations (
 id uuid PRIMARY KEY,
 actor_id uuid NOT NULL REFERENCES nite_connect.members(id),
 operation_type varchar(16) NOT NULL CHECK (operation_type IN ('ITEM','EMPTY')),
 status varchar(20) NOT NULL CHECK (status IN ('BLOCKED_POLICY','PENDING','PROCESSING','PARTIAL','COMPLETED','FAILED')),
 idempotency_key varchar(128) NOT NULL,
 policy_id uuid REFERENCES nite_connect.document_retention_policies(id),
 item_count integer NOT NULL DEFAULT 0 CHECK (item_count >= 0),
 estimated_bytes bigint NOT NULL DEFAULT 0 CHECK (estimated_bytes >= 0),
 requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 started_at timestamptz,
 finished_at timestamptz,
 result_code varchar(64),
 UNIQUE(actor_id,idempotency_key),
 CHECK ((status IN ('COMPLETED','FAILED') AND finished_at IS NOT NULL)
     OR (status NOT IN ('COMPLETED','FAILED') AND finished_at IS NULL))
);

CREATE TABLE nite_connect.document_purge_operation_items (
 id uuid PRIMARY KEY,
 operation_id uuid NOT NULL REFERENCES nite_connect.document_purge_operations(id),
 resource_id uuid NOT NULL,
 resource_type varchar(12) NOT NULL CHECK (resource_type IN ('DOCUMENT','FOLDER')),
 state varchar(16) NOT NULL CHECK (state IN ('BLOCKED','PENDING','PROCESSING','PARTIAL','PURGED','FAILED')),
 reason_code varchar(64),
 estimated_bytes bigint NOT NULL DEFAULT 0 CHECK (estimated_bytes >= 0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(operation_id,resource_type,resource_id)
);
CREATE INDEX document_purge_items_operation_idx ON nite_connect.document_purge_operation_items(operation_id,state);

CREATE TABLE nite_connect.document_purge_objects (
 id uuid PRIMARY KEY,
 operation_id uuid NOT NULL REFERENCES nite_connect.document_purge_operations(id),
 operation_item_id uuid NOT NULL REFERENCES nite_connect.document_purge_operation_items(id),
 object_id uuid NOT NULL,
 storage_kind varchar(12) NOT NULL CHECK (storage_kind IN ('DOCUMENT','ASSET')),
 estimated_bytes bigint NOT NULL DEFAULT 0 CHECK (estimated_bytes >= 0),
 state varchar(16) NOT NULL CHECK (state IN ('PENDING','PROCESSING','PURGED','RETRY','BLOCKED_REFERENCE','FAILED')),
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
 last_attempt_at timestamptz,
 purged_at timestamptz,
 last_error_code varchar(64),
 UNIQUE(operation_item_id,storage_kind,object_id),
 UNIQUE(operation_id,storage_kind,object_id),
 CHECK ((state='PURGED') = (purged_at IS NOT NULL))
);
CREATE INDEX document_purge_objects_pending_idx ON nite_connect.document_purge_objects(state,last_attempt_at,id)
 WHERE state IN ('PENDING','RETRY','PROCESSING');

-- Tombstones retain minimal evidence after bytes are removed. No content or storage credentials are copied here.
CREATE TABLE nite_connect.document_purge_tombstones (
 id uuid PRIMARY KEY,
 operation_id uuid NOT NULL REFERENCES nite_connect.document_purge_operations(id),
 resource_id uuid NOT NULL,
 resource_type varchar(12) NOT NULL CHECK (resource_type IN ('DOCUMENT','FOLDER')),
 actor_id uuid NOT NULL REFERENCES nite_connect.members(id),
 purged_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 policy_id uuid REFERENCES nite_connect.document_retention_policies(id),
 policy_hash char(64),
 object_count integer NOT NULL CHECK (object_count >= 0),
 removed_bytes bigint NOT NULL CHECK (removed_bytes >= 0),
 UNIQUE(resource_type,resource_id)
);

ALTER TABLE nite_connect.documents
  ADD COLUMN purged_at timestamptz,
  ADD COLUMN purge_operation_id uuid REFERENCES nite_connect.document_purge_operations(id);
ALTER TABLE nite_connect.documents DROP CONSTRAINT document_lifecycle_state_check;
ALTER TABLE nite_connect.documents ADD CONSTRAINT document_lifecycle_state_check
  CHECK (lifecycle_state IN ('ACTIVE','TRASHED','PURGE_PENDING','PURGED'));
ALTER TABLE nite_connect.documents DROP CONSTRAINT document_trash_metadata_check;
ALTER TABLE nite_connect.documents ADD CONSTRAINT document_trash_metadata_check CHECK (
  (lifecycle_state='ACTIVE' AND deleted_at IS NULL AND deleted_by IS NULL AND trash_batch_id IS NULL AND purged_at IS NULL AND purge_operation_id IS NULL)
  OR (lifecycle_state='TRASHED' AND deleted_at IS NOT NULL AND deleted_by IS NOT NULL AND trash_batch_id IS NOT NULL AND purged_at IS NULL AND purge_operation_id IS NULL)
  OR (lifecycle_state='PURGE_PENDING' AND deleted_at IS NOT NULL AND deleted_by IS NOT NULL AND trash_batch_id IS NOT NULL AND purged_at IS NULL AND purge_operation_id IS NOT NULL)
  OR (lifecycle_state='PURGED' AND deleted_at IS NOT NULL AND deleted_by IS NOT NULL AND trash_batch_id IS NOT NULL AND purged_at IS NOT NULL AND purge_operation_id IS NOT NULL)
);

ALTER TABLE nite_connect.document_folders
  ADD COLUMN purged_at timestamptz,
  ADD COLUMN purge_operation_id uuid REFERENCES nite_connect.document_purge_operations(id);
ALTER TABLE nite_connect.document_folders DROP CONSTRAINT folder_lifecycle_state_check;
ALTER TABLE nite_connect.document_folders ADD CONSTRAINT folder_lifecycle_state_check
  CHECK (lifecycle_state IN ('ACTIVE','TRASHED','PURGE_PENDING','PURGED'));
ALTER TABLE nite_connect.document_folders DROP CONSTRAINT folder_trash_metadata_check;
ALTER TABLE nite_connect.document_folders ADD CONSTRAINT folder_trash_metadata_check CHECK (
  (lifecycle_state='ACTIVE' AND deleted_at IS NULL AND deleted_by IS NULL AND trash_batch_id IS NULL AND purged_at IS NULL AND purge_operation_id IS NULL)
  OR (lifecycle_state='TRASHED' AND deleted_at IS NOT NULL AND deleted_by IS NOT NULL AND trash_batch_id IS NOT NULL AND purged_at IS NULL AND purge_operation_id IS NULL)
  OR (lifecycle_state='PURGE_PENDING' AND deleted_at IS NOT NULL AND deleted_by IS NOT NULL AND trash_batch_id IS NOT NULL AND purged_at IS NULL AND purge_operation_id IS NOT NULL)
  OR (lifecycle_state='PURGED' AND deleted_at IS NOT NULL AND deleted_by IS NOT NULL AND trash_batch_id IS NOT NULL AND purged_at IS NOT NULL AND purge_operation_id IS NOT NULL)
);

DROP INDEX nite_connect.document_folder_sibling_idx;
CREATE UNIQUE INDEX document_folder_sibling_idx ON nite_connect.document_folders(parent_id,lower(btrim(name)))
 WHERE archived_at IS NULL AND lifecycle_state='ACTIVE' AND parent_id IS NOT NULL;
DROP INDEX nite_connect.document_folder_top_level_idx;
CREATE UNIQUE INDEX document_folder_top_level_idx ON nite_connect.document_folders(lower(btrim(name)))
 WHERE archived_at IS NULL AND lifecycle_state='ACTIVE' AND parent_id IS NULL;

CREATE INDEX document_purge_document_state_idx ON nite_connect.documents(lifecycle_state,purged_at,id)
 WHERE lifecycle_state IN ('PURGE_PENDING','PURGED');
CREATE INDEX document_purge_folder_state_idx ON nite_connect.document_folders(lifecycle_state,purged_at,id)
 WHERE lifecycle_state IN ('PURGE_PENDING','PURGED');
