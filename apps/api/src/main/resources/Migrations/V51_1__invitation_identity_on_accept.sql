-- New invitations bind the Entra identity only after the recipient authenticates.
-- Existing invitations retain their pre-resolved object_id binding.
ALTER TABLE nite_connect.invitations ALTER COLUMN object_id DROP NOT NULL;
ALTER TABLE nite_connect.invitations ADD CONSTRAINT invitations_accepted_identity_check
    CHECK (accepted_at IS NULL OR object_id IS NOT NULL);
