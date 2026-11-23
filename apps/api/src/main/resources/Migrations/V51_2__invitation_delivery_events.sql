ALTER TABLE nite_connect.invitations DROP CONSTRAINT invitations_send_state_check;
ALTER TABLE nite_connect.invitations ADD CONSTRAINT invitations_send_state_check
    CHECK (send_state IN ('NOT_SENT','ACCEPTED_BY_PROVIDER','DELIVERY_DELAYED','DELIVERED','BOUNCED','SUPPRESSED','PROVIDER_FAILED','FAILED'));
ALTER TABLE nite_connect.invitations ADD COLUMN last_delivery_event_at timestamptz;
