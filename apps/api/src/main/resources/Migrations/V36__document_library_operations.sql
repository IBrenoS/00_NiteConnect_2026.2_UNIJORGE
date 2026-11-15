-- B05.7A: preferences and copy provenance; existing resources and revisions remain untouched.
ALTER TABLE nite_connect.documents ADD COLUMN copied_from_id uuid REFERENCES nite_connect.documents(id);
ALTER TABLE nite_connect.document_folders ADD COLUMN copied_from_id uuid REFERENCES nite_connect.document_folders(id);

CREATE TABLE nite_connect.document_favorites (
 id uuid PRIMARY KEY,
 member_id uuid NOT NULL REFERENCES nite_connect.members(id),
 document_id uuid REFERENCES nite_connect.documents(id),
 folder_id uuid REFERENCES nite_connect.document_folders(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK ((document_id IS NULL) <> (folder_id IS NULL))
);
CREATE UNIQUE INDEX document_favorites_document_idx ON nite_connect.document_favorites(member_id,document_id) WHERE document_id IS NOT NULL;
CREATE UNIQUE INDEX document_favorites_folder_idx ON nite_connect.document_favorites(member_id,folder_id) WHERE folder_id IS NOT NULL;

CREATE TABLE nite_connect.document_operation_receipts (
 actor_id uuid NOT NULL REFERENCES nite_connect.members(id),
 idempotency_key varchar(128) NOT NULL,
 request_sha256 char(64) NOT NULL,
 response_json jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (actor_id,idempotency_key)
);
