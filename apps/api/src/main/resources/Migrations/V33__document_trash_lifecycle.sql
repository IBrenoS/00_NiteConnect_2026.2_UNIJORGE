-- B05.6.2: recoverable deletion is independent from institutional archiving.
ALTER TABLE nite_connect.documents
  ADD COLUMN lifecycle_state varchar(16) NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deleted_by uuid REFERENCES nite_connect.members(id),
  ADD COLUMN trash_batch_id uuid,
  ADD COLUMN restored_at timestamptz,
  ADD COLUMN restored_by uuid REFERENCES nite_connect.members(id),
  ADD CONSTRAINT document_lifecycle_state_check CHECK (lifecycle_state IN ('ACTIVE','TRASHED')),
  ADD CONSTRAINT document_trash_metadata_check CHECK (
    (lifecycle_state='ACTIVE' AND deleted_at IS NULL AND deleted_by IS NULL AND trash_batch_id IS NULL)
    OR (lifecycle_state='TRASHED' AND deleted_at IS NOT NULL AND deleted_by IS NOT NULL AND trash_batch_id IS NOT NULL)
  ),
  ADD CONSTRAINT document_archive_trash_exclusive_check CHECK (archived_at IS NULL OR lifecycle_state='ACTIVE');

ALTER TABLE nite_connect.document_folders
  ADD COLUMN lifecycle_state varchar(16) NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deleted_by uuid REFERENCES nite_connect.members(id),
  ADD COLUMN trash_batch_id uuid,
  ADD COLUMN restored_at timestamptz,
  ADD COLUMN restored_by uuid REFERENCES nite_connect.members(id),
  ADD CONSTRAINT folder_lifecycle_state_check CHECK (lifecycle_state IN ('ACTIVE','TRASHED')),
  ADD CONSTRAINT folder_trash_metadata_check CHECK (
    (lifecycle_state='ACTIVE' AND deleted_at IS NULL AND deleted_by IS NULL AND trash_batch_id IS NULL)
    OR (lifecycle_state='TRASHED' AND deleted_at IS NOT NULL AND deleted_by IS NOT NULL AND trash_batch_id IS NOT NULL)
  ),
  ADD CONSTRAINT folder_archive_trash_exclusive_check CHECK (archived_at IS NULL OR lifecycle_state='ACTIVE');

CREATE INDEX document_trash_owner_idx ON nite_connect.documents(space_owner_id,deleted_at DESC,id)
  WHERE lifecycle_state='TRASHED';
CREATE INDEX folder_trash_owner_idx ON nite_connect.document_folders(space_owner_id,deleted_at DESC,id)
  WHERE lifecycle_state='TRASHED';

-- Names in the active namespace are reusable while an item is in Trash.
DROP INDEX nite_connect.document_folder_sibling_idx;
CREATE UNIQUE INDEX document_folder_sibling_idx ON nite_connect.document_folders(parent_id,lower(btrim(name)))
  WHERE archived_at IS NULL AND lifecycle_state='ACTIVE' AND parent_id IS NOT NULL;
DROP INDEX nite_connect.document_folder_top_level_idx;
CREATE UNIQUE INDEX document_folder_top_level_idx ON nite_connect.document_folders(lower(btrim(name)))
  WHERE archived_at IS NULL AND lifecycle_state='ACTIVE' AND parent_id IS NULL;
DROP INDEX nite_connect.document_folder_parent_idx;
CREATE INDEX document_folder_parent_idx ON nite_connect.document_folders(parent_id)
  WHERE archived_at IS NULL AND lifecycle_state='ACTIVE';

-- Existing archival rows remain archived, never silently reclassified as personal trash.
