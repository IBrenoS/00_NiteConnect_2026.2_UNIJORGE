-- B08.7A: preserve the Entra object binding and add delivery state.
ALTER TABLE nite_connect.invitations ADD COLUMN initial_role varchar(24) NOT NULL DEFAULT 'INTEGRANTE'
    CHECK (initial_role IN ('INTEGRANTE','GESTOR_PROJETO','GESTOR_GERAL','COORDENADOR'));
ALTER TABLE nite_connect.invitations ADD COLUMN message varchar(1000);
ALTER TABLE nite_connect.invitations ADD COLUMN provider_message_id varchar(128);
ALTER TABLE nite_connect.invitations ADD COLUMN send_state varchar(24) NOT NULL DEFAULT 'NOT_SENT'
    CHECK (send_state IN ('NOT_SENT','ACCEPTED_BY_PROVIDER','FAILED'));
ALTER TABLE nite_connect.invitations ADD COLUMN send_attempts integer NOT NULL DEFAULT 0 CHECK (send_attempts >= 0);
ALTER TABLE nite_connect.invitations ADD COLUMN last_send_at timestamptz;
ALTER TABLE nite_connect.invitations ADD COLUMN send_error_code varchar(48);
ALTER TABLE nite_connect.members ADD COLUMN last_access_at timestamptz;
CREATE INDEX invitations_state_created_idx ON nite_connect.invitations (send_state, created_at DESC, id);
