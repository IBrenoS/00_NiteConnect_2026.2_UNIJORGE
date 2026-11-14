ALTER TABLE nite_connect.document_wopi_locks
    ADD COLUMN actor_id uuid REFERENCES nite_connect.members(id);

CREATE INDEX document_wopi_locks_actor_idx
    ON nite_connect.document_wopi_locks(actor_id, expires_at);
