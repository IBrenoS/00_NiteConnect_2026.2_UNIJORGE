-- Bloco 05.1: tokens WOPI de uso limitado e bloqueios por documento. V6/V7/V10 são imutáveis.
CREATE TABLE nite_connect.document_wopi_sessions (
 id uuid PRIMARY KEY,
 document_id uuid NOT NULL REFERENCES nite_connect.documents(id),
 actor_id uuid NOT NULL REFERENCES nite_connect.members(id),
 token_sha256 char(64) NOT NULL UNIQUE,
 source_version_id uuid NOT NULL,
 can_write boolean NOT NULL,
 issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 FOREIGN KEY (document_id,source_version_id) REFERENCES nite_connect.document_versions(document_id,id),
 CHECK (expires_at > issued_at),
 CHECK (revoked_at IS NULL OR revoked_at >= issued_at)
);
CREATE INDEX document_wopi_sessions_document_idx ON nite_connect.document_wopi_sessions(document_id,expires_at);
CREATE INDEX document_wopi_sessions_actor_idx ON nite_connect.document_wopi_sessions(actor_id,expires_at);

CREATE TABLE nite_connect.document_wopi_locks (
 document_id uuid PRIMARY KEY REFERENCES nite_connect.documents(id),
 lock_value varchar(1024) NOT NULL,
 expires_at timestamptz NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
