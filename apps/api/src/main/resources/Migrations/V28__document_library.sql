-- Bloco 05.2: biblioteca única. Preserva V6/V27 e todos os UUIDs/objetos documentais.
CREATE TABLE nite_connect.document_folders (
 id uuid PRIMARY KEY,
 parent_id uuid REFERENCES nite_connect.document_folders(id),
 name varchar(190) NOT NULL CHECK (length(btrim(name))>0),
 color varchar(7) NOT NULL DEFAULT '#D6A432' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
 kind varchar(16) NOT NULL CHECK(kind IN ('ROOT','PERSONAL','PROJECT','CUSTOM')),
 system_key varchar(48),
 owner_id uuid REFERENCES nite_connect.members(id),
 project_id uuid REFERENCES nite_connect.projects(id),
 created_by uuid REFERENCES nite_connect.members(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 modified_by uuid REFERENCES nite_connect.members(id),
 modified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 archived_at timestamptz,
 archive_batch_id uuid,
 CHECK (parent_id IS NULL OR parent_id<>id),
 CHECK ((kind='ROOT' AND parent_id IS NULL AND system_key IS NOT NULL AND owner_id IS NULL AND project_id IS NULL)
    OR (kind='PERSONAL' AND owner_id IS NOT NULL AND project_id IS NULL AND system_key IS NULL AND parent_id IS NOT NULL)
    OR (kind='PROJECT' AND project_id IS NOT NULL AND owner_id IS NULL AND system_key IS NULL AND parent_id IS NOT NULL)
    OR (kind='CUSTOM' AND system_key IS NULL AND owner_id IS NULL AND project_id IS NULL))
);
CREATE UNIQUE INDEX document_folder_root_key_idx ON nite_connect.document_folders(system_key) WHERE system_key IS NOT NULL;
CREATE UNIQUE INDEX document_folder_personal_idx ON nite_connect.document_folders(owner_id) WHERE owner_id IS NOT NULL AND archived_at IS NULL;
CREATE UNIQUE INDEX document_folder_project_idx ON nite_connect.document_folders(project_id) WHERE project_id IS NOT NULL AND archived_at IS NULL;
CREATE UNIQUE INDEX document_folder_sibling_idx ON nite_connect.document_folders(parent_id,lower(btrim(name))) WHERE archived_at IS NULL AND parent_id IS NOT NULL;
CREATE UNIQUE INDEX document_folder_top_level_idx ON nite_connect.document_folders(lower(btrim(name))) WHERE archived_at IS NULL AND parent_id IS NULL;
CREATE INDEX document_folder_parent_idx ON nite_connect.document_folders(parent_id) WHERE archived_at IS NULL;

CREATE TABLE nite_connect.document_folder_events (
 id uuid PRIMARY KEY,
 folder_id uuid NOT NULL REFERENCES nite_connect.document_folders(id),
 actor_id uuid NOT NULL REFERENCES nite_connect.members(id),
 action varchar(50) NOT NULL,
 reason varchar(1000) NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX document_folder_events_idx ON nite_connect.document_folder_events(folder_id,occurred_at,id);
CREATE TRIGGER document_folder_events_immutable BEFORE UPDATE OR DELETE ON nite_connect.document_folder_events
 FOR EACH ROW EXECUTE FUNCTION nite_connect.document_immutable_row();

INSERT INTO nite_connect.document_folders(id,name,kind,system_key)
VALUES (gen_random_uuid(),'Integrantes','ROOT','INTEGRANTES'),
       (gen_random_uuid(),'Projetos','ROOT','PROJETOS'),
       (gen_random_uuid(),'Materiais institucionais','ROOT','MATERIAIS'),
       (gen_random_uuid(),'Modelos oficiais','ROOT','MODELOS');

INSERT INTO nite_connect.document_folders(id,parent_id,name,kind,owner_id)
SELECT gen_random_uuid(),r.id,
       CASE WHEN EXISTS (SELECT 1 FROM nite_connect.members s WHERE lower(btrim(s.name))=lower(btrim(m.name)) AND s.id<>m.id)
            THEN left(m.name,170)||' ('||left(m.id::text,8)||')' ELSE left(m.name,190) END,
       'PERSONAL',m.id
FROM nite_connect.members m CROSS JOIN nite_connect.document_folders r
WHERE r.system_key='INTEGRANTES' AND m.status='ATIVO';

INSERT INTO nite_connect.document_folders(id,parent_id,name,kind,project_id)
SELECT gen_random_uuid(),r.id,
       CASE WHEN EXISTS (SELECT 1 FROM nite_connect.projects q WHERE lower(btrim(q.title))=lower(btrim(p.title)) AND q.id<>p.id)
            THEN left(p.title,170)||' ('||left(p.id::text,8)||')' ELSE left(p.title,190) END,
       'PROJECT',p.id
FROM nite_connect.projects p CROSS JOIN nite_connect.document_folders r WHERE r.system_key='PROJETOS';

ALTER TABLE nite_connect.documents ADD COLUMN folder_id uuid REFERENCES nite_connect.document_folders(id);
ALTER TABLE nite_connect.documents ADD COLUMN archive_batch_id uuid;
ALTER TABLE nite_connect.documents ADD COLUMN mime_type varchar(100) NOT NULL DEFAULT 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
ALTER TABLE nite_connect.documents ADD COLUMN stored_as_asset boolean NOT NULL DEFAULT false;
ALTER TABLE nite_connect.documents ADD COLUMN modified_by uuid REFERENCES nite_connect.members(id);
ALTER TABLE nite_connect.documents ADD COLUMN modified_at timestamptz NOT NULL DEFAULT clock_timestamp();
ALTER TABLE nite_connect.documents ADD COLUMN last_opened_at timestamptz;
ALTER TABLE nite_connect.documents ADD COLUMN last_opened_by uuid REFERENCES nite_connect.members(id);
UPDATE nite_connect.documents d SET folder_id=f.id,
    modified_by=coalesce((SELECT v.created_by FROM nite_connect.document_versions v WHERE v.id=d.current_version_id),d.created_by),
    modified_at=coalesce((SELECT v.created_at FROM nite_connect.document_versions v WHERE v.id=d.current_version_id),d.created_at)
FROM nite_connect.document_folders f
WHERE f.kind='PERSONAL' AND d.context='PERSONAL' AND d.owner_id=f.owner_id;
UPDATE nite_connect.documents d SET folder_id=f.id, modified_by=coalesce(d.modified_by,d.created_by)
FROM nite_connect.document_folders f WHERE f.kind='PROJECT' AND d.context='PROJECT' AND d.project_id=f.project_id AND d.folder_id IS NULL;
-- Historical non-personal records are attached to the institutional folder without changing their UUIDs.
UPDATE nite_connect.documents d SET folder_id=(select id from nite_connect.document_folders where system_key='MATERIAIS'),
  modified_by=coalesce(d.modified_by,d.created_by)
WHERE d.folder_id IS NULL AND d.context IN ('ADMINISTRATIVE','EVENT');
CREATE INDEX documents_folder_idx ON nite_connect.documents(folder_id) WHERE archived_at IS NULL;

ALTER TABLE nite_connect.document_templates ADD COLUMN auto_assign_on_join boolean NOT NULL DEFAULT false;
CREATE TABLE nite_connect.document_template_distributions (
 id uuid PRIMARY KEY,
 template_version_id uuid NOT NULL REFERENCES nite_connect.document_template_versions(id),
 recipient_id uuid NOT NULL REFERENCES nite_connect.members(id),
 document_id uuid NOT NULL UNIQUE REFERENCES nite_connect.documents(id),
 distributed_by uuid NOT NULL REFERENCES nite_connect.members(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(template_version_id,recipient_id)
);
CREATE INDEX document_template_distributions_recipient_idx ON nite_connect.document_template_distributions(recipient_id);
