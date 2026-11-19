CREATE TABLE nite_connect.activity_plannings (
 id uuid PRIMARY KEY,
 title varchar(200) NOT NULL CHECK (length(trim(title))>0),
 description varchar(10000) NOT NULL DEFAULT '' CHECK (length(trim(description))>0 OR description=''),
 project_id uuid REFERENCES nite_connect.projects(id),
 created_by uuid NOT NULL REFERENCES nite_connect.members(id),
 version bigint NOT NULL DEFAULT 0 CHECK (version>=0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX activity_plannings_project_idx ON nite_connect.activity_plannings(project_id,created_at DESC,id);
CREATE INDEX activity_plannings_creator_idx ON nite_connect.activity_plannings(created_by,created_at DESC,id);

ALTER TABLE nite_connect.activities ADD COLUMN planning_id uuid;
ALTER TABLE nite_connect.activities ADD CONSTRAINT activities_planning_id_fkey
 FOREIGN KEY(planning_id) REFERENCES nite_connect.activity_plannings(id) ON DELETE RESTRICT;
CREATE INDEX activities_planning_idx ON nite_connect.activities(planning_id,created_at,id) WHERE planning_id IS NOT NULL;

CREATE FUNCTION nite_connect.require_activity_planning_project_match() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE planning_project uuid;
BEGIN
 IF NEW.planning_id IS NULL THEN RETURN NEW; END IF;
 SELECT project_id INTO planning_project FROM nite_connect.activity_plannings WHERE id=NEW.planning_id;
 IF NOT FOUND OR planning_project IS DISTINCT FROM NEW.project_id THEN
  RAISE EXCEPTION 'Activity and planning project scopes must match' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;

CREATE TRIGGER activity_planning_project_match
 BEFORE INSERT OR UPDATE OF planning_id,project_id ON nite_connect.activities
 FOR EACH ROW EXECUTE FUNCTION nite_connect.require_activity_planning_project_match();

CREATE FUNCTION nite_connect.preserve_activity_planning_context() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
  RAISE EXCEPTION 'Activity planning origin is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;

CREATE TRIGGER preserve_activity_planning_context
 BEFORE UPDATE ON nite_connect.activity_plannings
 FOR EACH ROW EXECUTE FUNCTION nite_connect.preserve_activity_planning_context();

ALTER TABLE nite_connect.audit_events DROP CONSTRAINT audit_entity_check;
ALTER TABLE nite_connect.audit_events ADD CONSTRAINT audit_entity_check CHECK (
 (entity_type='MEMBER' AND member_id IS NOT NULL AND (entity_id IS NULL OR entity_id=member_id)) OR
 (entity_type IN ('PROJECT','PROPOSAL','ACTIVITY','EVIDENCE','CALENDAR_EVENT','ATTENDANCE','ATTENDANCE_SEGMENT','PERIOD','JUSTIFICATION',
                  'CORRECTION','DOCUMENT','DOCUMENT_TEMPLATE','WORK_LOG_CORRECTION_RESPONSE','ACTIVITY_PLANNING')
  AND entity_id IS NOT NULL AND member_id IS NULL)
);
