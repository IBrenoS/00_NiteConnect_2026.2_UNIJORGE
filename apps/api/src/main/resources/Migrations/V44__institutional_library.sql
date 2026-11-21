-- Additive contracts: one namespace, existing MATERIAIS root, no file/object copies.
ALTER TABLE nite_connect.document_grants ADD COLUMN message varchar(1000);

ALTER TABLE nite_connect.documents
 ADD COLUMN trash_original_path text,
 ADD COLUMN trash_root_key varchar(48),
 ADD COLUMN trash_project_id uuid,
 ADD COLUMN trash_project_title text;
ALTER TABLE nite_connect.document_folders
 ADD COLUMN trash_original_path text,
 ADD COLUMN trash_root_key varchar(48),
 ADD COLUMN trash_project_id uuid,
 ADD COLUMN trash_project_title text;

CREATE FUNCTION nite_connect.document_location(folder uuid)
RETURNS TABLE(path text,root_key varchar,project_id uuid,project_title varchar)
LANGUAGE sql STABLE AS $$
 WITH RECURSIVE ancestors AS (
   SELECT f.id,f.parent_id,f.name::text path,f.system_key,f.project_id,0 depth,ARRAY[f.id] visited
   FROM nite_connect.document_folders f WHERE f.id=folder
   UNION ALL
   SELECT p.id,p.parent_id,p.name||' / '||a.path,p.system_key,coalesce(a.project_id,p.project_id),
     a.depth+1,a.visited||p.id
   FROM ancestors a JOIN nite_connect.document_folders p ON p.id=a.parent_id
   WHERE a.depth<63 AND NOT p.id=ANY(a.visited)
 ) SELECT a.path,a.system_key,a.project_id,p.title
   FROM ancestors a LEFT JOIN nite_connect.projects p ON p.id=a.project_id
   ORDER BY a.depth DESC LIMIT 1
$$;

CREATE FUNCTION nite_connect.snapshot_document_trash_location() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE location record;
BEGIN
 IF OLD.lifecycle_state='ACTIVE' AND NEW.lifecycle_state='TRASHED' THEN
   IF TG_TABLE_NAME='documents' THEN
     SELECT * INTO location FROM nite_connect.document_location(OLD.folder_id);
     NEW.trash_original_path=concat_ws(' / ',location.path,OLD.title);
     NEW.trash_project_id=coalesce(location.project_id,OLD.project_id);
   ELSE
     SELECT * INTO location FROM nite_connect.document_location(OLD.id);
     NEW.trash_original_path=location.path;
     NEW.trash_project_id=location.project_id;
   END IF;
   NEW.trash_root_key=location.root_key;
   SELECT title INTO NEW.trash_project_title FROM nite_connect.projects WHERE id=NEW.trash_project_id;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER document_trash_location BEFORE UPDATE OF lifecycle_state ON nite_connect.documents
 FOR EACH ROW EXECUTE FUNCTION nite_connect.snapshot_document_trash_location();
CREATE TRIGGER folder_trash_location BEFORE UPDATE OF lifecycle_state ON nite_connect.document_folders
 FOR EACH ROW EXECUTE FUNCTION nite_connect.snapshot_document_trash_location();

-- Existing trash has no historical snapshot: best available current ancestry, without changing lifecycle/audit.
UPDATE nite_connect.documents d SET
 trash_original_path=concat_ws(' / ',(SELECT path FROM nite_connect.document_location(d.folder_id)),d.title),
 trash_root_key=(SELECT root_key FROM nite_connect.document_location(d.folder_id)),
 trash_project_id=coalesce(d.project_id,(SELECT project_id FROM nite_connect.document_location(d.folder_id))),
 trash_project_title=(SELECT p.title FROM nite_connect.projects p WHERE p.id=coalesce(d.project_id,
   (SELECT project_id FROM nite_connect.document_location(d.folder_id))))
WHERE d.lifecycle_state<>'ACTIVE';
UPDATE nite_connect.document_folders f SET
 trash_original_path=(SELECT path FROM nite_connect.document_location(f.id)),
 trash_root_key=(SELECT root_key FROM nite_connect.document_location(f.id)),
 trash_project_id=(SELECT project_id FROM nite_connect.document_location(f.id)),
 trash_project_title=(SELECT project_title FROM nite_connect.document_location(f.id))
WHERE f.lifecycle_state<>'ACTIVE';

CREATE INDEX document_institutional_recipient_idx ON nite_connect.documents(created_for,id)
 WHERE lifecycle_state='ACTIVE' AND archived_at IS NULL AND resource_owner_kind IN ('INSTITUTION','PROJECT');
