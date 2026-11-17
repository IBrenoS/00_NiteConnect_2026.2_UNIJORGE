-- Permanent activity removal: retain independent history, detach its references,
-- and queue private evidence bytes for idempotent deletion after commit.
CREATE TABLE nite_connect.activity_deletion_context (
 activity_id uuid PRIMARY KEY,
 actor_id uuid NOT NULL REFERENCES nite_connect.members(id),
 expected_version bigint NOT NULL CHECK(expected_version>=0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE FUNCTION nite_connect.activity_deletion_is_authorized(target uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
 SELECT EXISTS(
  SELECT 1 FROM nite_connect.activity_deletion_context d
  JOIN nite_connect.activities a ON a.id=d.activity_id AND a.created_by=d.actor_id
  JOIN nite_connect.members m ON m.id=d.actor_id AND m.status='ATIVO'
  WHERE d.activity_id=target AND a.version=d.expected_version
 )
$$;

CREATE FUNCTION nite_connect.protect_activity_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT nite_connect.activity_deletion_is_authorized(OLD.id) THEN
  RAISE EXCEPTION 'Activity deletion requires its active creator and current version' USING ERRCODE='42501';
 END IF;
 RETURN OLD;
END;
$$;
DROP TRIGGER preserve_activity ON nite_connect.activities;
CREATE TRIGGER preserve_activity_updates BEFORE UPDATE ON nite_connect.activities
 FOR EACH ROW EXECUTE FUNCTION nite_connect.preserve_activity_context();
CREATE TRIGGER authorize_activity_delete BEFORE DELETE ON nite_connect.activities
 FOR EACH ROW EXECUTE FUNCTION nite_connect.protect_activity_delete();

CREATE FUNCTION nite_connect.protect_activity_child_delete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid;
BEGIN
 target=OLD.activity_id;
 IF NOT nite_connect.activity_deletion_is_authorized(target) THEN
  RAISE EXCEPTION 'Activity data cannot be deleted outside permanent activity deletion' USING ERRCODE='42501';
 END IF;
 RETURN OLD;
END;
$$;

DROP TRIGGER preserve_activity_period ON nite_connect.activity_assignments;
CREATE TRIGGER preserve_activity_assignment_updates BEFORE UPDATE ON nite_connect.activity_assignments
 FOR EACH ROW EXECUTE FUNCTION nite_connect.close_project_period_only();
CREATE TRIGGER authorize_activity_assignment_delete BEFORE DELETE ON nite_connect.activity_assignments
 FOR EACH ROW EXECUTE FUNCTION nite_connect.protect_activity_child_delete();

DROP TRIGGER immutable_activity_events ON nite_connect.activity_events;
CREATE TRIGGER immutable_activity_events_update BEFORE UPDATE ON nite_connect.activity_events
 FOR EACH ROW EXECUTE FUNCTION nite_connect.reject_history_mutation();
CREATE TRIGGER authorize_activity_event_delete BEFORE DELETE ON nite_connect.activity_events
 FOR EACH ROW EXECUTE FUNCTION nite_connect.protect_activity_child_delete();

DROP TRIGGER preserve_evidence ON nite_connect.activity_evidence;
CREATE TRIGGER preserve_evidence_updates BEFORE UPDATE ON nite_connect.activity_evidence
 FOR EACH ROW EXECUTE FUNCTION nite_connect.withdraw_evidence_only();
CREATE TRIGGER authorize_activity_evidence_delete BEFORE DELETE ON nite_connect.activity_evidence
 FOR EACH ROW EXECUTE FUNCTION nite_connect.protect_activity_child_delete();

DROP TRIGGER preserve_evidence_object ON nite_connect.evidence_objects;
CREATE TRIGGER preserve_evidence_object_updates BEFORE UPDATE ON nite_connect.evidence_objects
 FOR EACH ROW EXECUTE FUNCTION nite_connect.preserve_evidence_object();
CREATE TRIGGER authorize_evidence_object_delete BEFORE DELETE ON nite_connect.evidence_objects
 FOR EACH ROW EXECUTE FUNCTION nite_connect.protect_activity_child_delete();

CREATE TABLE nite_connect.activity_evidence_deletion_outbox (
 id uuid PRIMARY KEY,
 object_key uuid NOT NULL UNIQUE,
 state varchar(16) NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','PROCESSING','FAILED','DELETED')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 lease_until timestamptz,
 last_error_code varchar(64),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 completed_at timestamptz,
 CHECK((state='PROCESSING' AND lease_until IS NOT NULL) OR state<>'PROCESSING'),
 CHECK((state='DELETED' AND completed_at IS NOT NULL) OR state<>'DELETED')
);
CREATE INDEX activity_evidence_deletion_due_idx
 ON nite_connect.activity_evidence_deletion_outbox(state,next_attempt_at,id)
 WHERE state IN ('PENDING','FAILED','PROCESSING');

-- Project-health sources are immutable evaluation snapshots. Keep their captured
-- identifier as a value, but stop treating it as a live activity reference.
ALTER TABLE nite_connect.project_health_evaluation_sources
 DROP CONSTRAINT project_health_evaluation_sources_activity_id_fkey;
COMMENT ON COLUMN nite_connect.project_health_evaluation_sources.activity_id IS
 'Historical activity identifier captured by the immutable project-health evaluation; it is not a live activity reference.';

-- Keep audit rows immutable to ordinary operations. This one trigger permits only
-- removal of copied payloads for the activity and its evidence under the guard.
DROP TRIGGER immutable_audit_events ON nite_connect.audit_events;
CREATE FUNCTION nite_connect.protect_audit_event_snapshots() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'Audit records cannot be deleted';
 END IF;
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.actor_id IS DISTINCT FROM OLD.actor_id
    OR NEW.member_id IS DISTINCT FROM OLD.member_id OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
    OR NEW.entity_id IS DISTINCT FROM OLD.entity_id OR NEW.action IS DISTINCT FROM OLD.action
    OR NEW.occurred_at IS DISTINCT FROM OLD.occurred_at
    OR NEW.before_value IS NOT NULL OR NEW.after_value IS NOT NULL
    OR NEW.reason<>'Atividade excluída permanentemente'
    OR NOT EXISTS (
      SELECT 1 FROM nite_connect.activity_deletion_context d
      WHERE nite_connect.activity_deletion_is_authorized(d.activity_id)
        AND ((OLD.entity_type='ACTIVITY' AND OLD.entity_id=d.activity_id)
          OR (OLD.entity_type='EVIDENCE' AND EXISTS (
              SELECT 1 FROM nite_connect.activity_evidence e WHERE e.id=OLD.entity_id AND e.activity_id=d.activity_id
          )))
    ) THEN
  RAISE EXCEPTION 'Audit records are immutable outside activity snapshot sanitization';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_audit_events BEFORE UPDATE OR DELETE ON nite_connect.audit_events
 FOR EACH ROW EXECUTE FUNCTION nite_connect.protect_audit_event_snapshots();
