ALTER TABLE nite_connect.document_grants
    ALTER COLUMN document_id DROP NOT NULL,
    ADD COLUMN folder_id uuid REFERENCES nite_connect.document_folders(id),
    ADD COLUMN permission varchar(8);

UPDATE nite_connect.document_grants
SET permission = CASE WHEN can_edit THEN 'EDIT' ELSE 'VIEW' END;

ALTER TABLE nite_connect.document_grants
    ALTER COLUMN permission SET NOT NULL,
    ADD CONSTRAINT document_grants_one_target_check CHECK ((document_id IS NULL) <> (folder_id IS NULL)),
    ADD CONSTRAINT document_grants_permission_check CHECK (permission IN ('VIEW','EDIT')),
    ADD CONSTRAINT document_grants_permission_legacy_check CHECK (can_edit = (permission = 'EDIT'));

DROP INDEX nite_connect.document_current_grant_idx;
CREATE UNIQUE INDEX document_current_document_grant_idx
    ON nite_connect.document_grants(document_id,member_id) WHERE document_id IS NOT NULL AND revoked_at IS NULL;
CREATE UNIQUE INDEX document_current_folder_grant_idx
    ON nite_connect.document_grants(folder_id,member_id) WHERE folder_id IS NOT NULL AND revoked_at IS NULL;
CREATE INDEX document_grants_recipient_idx
    ON nite_connect.document_grants(member_id,created_at,id) WHERE revoked_at IS NULL;

CREATE TABLE nite_connect.document_share_events (
    id uuid PRIMARY KEY,
    document_id uuid REFERENCES nite_connect.documents(id),
    folder_id uuid REFERENCES nite_connect.document_folders(id),
    actor_id uuid NOT NULL REFERENCES nite_connect.members(id),
    recipient_id uuid NOT NULL REFERENCES nite_connect.members(id),
    action varchar(32) NOT NULL CHECK (action IN ('SHARE_GRANTED','SHARE_CHANGED','SHARE_REVOKED')),
    permission varchar(8) NOT NULL CHECK (permission IN ('VIEW','EDIT')),
    occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CHECK ((document_id IS NULL) <> (folder_id IS NULL))
);
CREATE INDEX document_share_events_document_idx ON nite_connect.document_share_events(document_id,occurred_at DESC,id DESC);
CREATE INDEX document_share_events_folder_idx ON nite_connect.document_share_events(folder_id,occurred_at DESC,id DESC);
CREATE FUNCTION nite_connect.document_share_event_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Immutable document share event'; END;
$$;
CREATE TRIGGER document_share_events_immutable BEFORE UPDATE OR DELETE ON nite_connect.document_share_events
    FOR EACH ROW EXECUTE FUNCTION nite_connect.document_share_event_immutable();
