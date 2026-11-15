-- B05.7B: file requests authorize a specific upload without granting folder browsing.
CREATE TABLE nite_connect.document_file_requests (
 id uuid PRIMARY KEY,
 requested_by uuid NOT NULL REFERENCES nite_connect.members(id),
 target_folder_id uuid NOT NULL REFERENCES nite_connect.document_folders(id),
 status varchar(12) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CANCELLED')),
 due_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 cancelled_at timestamptz,
 cancelled_by uuid REFERENCES nite_connect.members(id),
 CHECK ((status='OPEN' AND cancelled_at IS NULL AND cancelled_by IS NULL)
     OR (status='CANCELLED' AND cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL))
);
CREATE INDEX document_file_requests_requester_idx ON nite_connect.document_file_requests(requested_by,created_at DESC,id DESC);
CREATE INDEX document_file_requests_target_idx ON nite_connect.document_file_requests(target_folder_id) WHERE status='OPEN';

CREATE TABLE nite_connect.document_file_request_recipients (
 request_id uuid NOT NULL REFERENCES nite_connect.document_file_requests(id),
 member_id uuid NOT NULL REFERENCES nite_connect.members(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(request_id,member_id)
);
CREATE INDEX document_file_request_recipient_idx ON nite_connect.document_file_request_recipients(member_id,request_id);

CREATE TABLE nite_connect.document_file_request_uploads (
 id uuid PRIMARY KEY,
 request_id uuid NOT NULL REFERENCES nite_connect.document_file_requests(id),
 document_id uuid NOT NULL UNIQUE REFERENCES nite_connect.documents(id),
 uploaded_by uuid NOT NULL REFERENCES nite_connect.members(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX document_file_request_upload_idx ON nite_connect.document_file_request_uploads(request_id,created_at DESC,id DESC);

CREATE TABLE nite_connect.document_file_request_events (
 id uuid PRIMARY KEY,
 request_id uuid NOT NULL REFERENCES nite_connect.document_file_requests(id),
 actor_id uuid NOT NULL REFERENCES nite_connect.members(id),
 action varchar(16) NOT NULL CHECK (action IN ('CREATED','CANCELLED','UPLOADED')),
 document_id uuid REFERENCES nite_connect.documents(id),
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX document_file_request_events_idx ON nite_connect.document_file_request_events(request_id,occurred_at DESC,id DESC);
CREATE TRIGGER document_file_request_events_immutable BEFORE UPDATE OR DELETE ON nite_connect.document_file_request_events
 FOR EACH ROW EXECUTE FUNCTION nite_connect.document_immutable_row();

CREATE INDEX document_grants_issuer_active_idx ON nite_connect.document_grants(granted_by,created_at DESC,id DESC)
 WHERE revoked_at IS NULL;
