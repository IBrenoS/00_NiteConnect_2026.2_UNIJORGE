-- B05.6.1: identity is per resource; the historical owner_id remains the personal space holder.
ALTER TABLE nite_connect.documents
  ADD COLUMN space_owner_id uuid REFERENCES nite_connect.members(id),
  ADD COLUMN resource_owner_kind varchar(16) NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN resource_owner_id uuid,
  ADD COLUMN origin varchar(40) NOT NULL DEFAULT 'LEGACY_UNKNOWN',
  ADD COLUMN protection varchar(32) NOT NULL DEFAULT 'NONE',
  ADD COLUMN retention_hold boolean NOT NULL DEFAULT false,
  ADD COLUMN protection_reason varchar(500),
  ADD COLUMN protection_set_by uuid REFERENCES nite_connect.members(id),
  ADD COLUMN protection_revision integer NOT NULL DEFAULT 0,
  ADD COLUMN created_for uuid REFERENCES nite_connect.members(id),
  ADD CONSTRAINT document_resource_owner_kind_check CHECK (resource_owner_kind IN ('MEMBER','PROJECT','INSTITUTION','UNKNOWN')),
  ADD CONSTRAINT document_resource_owner_id_check CHECK ((resource_owner_kind IN ('MEMBER','PROJECT')) = (resource_owner_id IS NOT NULL)),
  ADD CONSTRAINT document_protection_check CHECK (protection IN ('NONE','OFFICIAL','ACADEMIC','ADMINISTRATIVE','UNKNOWN'));

ALTER TABLE nite_connect.document_folders
  ADD COLUMN space_owner_id uuid REFERENCES nite_connect.members(id),
  ADD COLUMN resource_owner_kind varchar(16) NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN resource_owner_id uuid,
  ADD COLUMN origin varchar(40) NOT NULL DEFAULT 'LEGACY_UNKNOWN',
  ADD COLUMN protection varchar(32) NOT NULL DEFAULT 'NONE',
  ADD COLUMN retention_hold boolean NOT NULL DEFAULT false,
  ADD COLUMN protection_reason varchar(500),
  ADD COLUMN protection_set_by uuid REFERENCES nite_connect.members(id),
  ADD COLUMN protection_revision integer NOT NULL DEFAULT 0,
  ADD COLUMN created_for uuid REFERENCES nite_connect.members(id),
  ADD CONSTRAINT folder_resource_owner_kind_check CHECK (resource_owner_kind IN ('MEMBER','PROJECT','INSTITUTION','UNKNOWN')),
  ADD CONSTRAINT folder_resource_owner_id_check CHECK ((resource_owner_kind IN ('MEMBER','PROJECT')) = (resource_owner_id IS NOT NULL)),
  ADD CONSTRAINT folder_protection_check CHECK (protection IN ('NONE','OFFICIAL','ACADEMIC','ADMINISTRATIVE','UNKNOWN'));

-- Only a personal item created by its space holder, without institutional markers,
-- has enough evidence for member ownership. The containing folder is not evidence.
UPDATE nite_connect.documents SET space_owner_id=owner_id WHERE context='PERSONAL';
UPDATE nite_connect.documents SET created_for=owner_id
WHERE context='PERSONAL' AND created_by<>owner_id;
UPDATE nite_connect.documents
SET resource_owner_kind='MEMBER',resource_owner_id=created_by,origin='PERSONAL_CREATED'
WHERE context='PERSONAL' AND created_by=owner_id AND template_version_id IS NULL AND NOT official;
UPDATE nite_connect.documents
SET resource_owner_kind='INSTITUTION',origin='INSTITUTIONAL_DISTRIBUTION',
    protection='OFFICIAL',protection_reason='Modelo oficial distribuído',created_for=owner_id
WHERE template_version_id IS NOT NULL OR id IN (SELECT document_id FROM nite_connect.document_template_distributions);
UPDATE nite_connect.documents
SET resource_owner_kind='INSTITUTION',origin='INSTITUTIONAL_RECORD',protection='OFFICIAL',
    protection_reason='Documento oficial legado'
WHERE official AND template_version_id IS NULL;
UPDATE nite_connect.documents
SET resource_owner_kind='PROJECT',resource_owner_id=project_id,origin='PROJECT_CREATED'
WHERE context='PROJECT' AND resource_owner_kind='UNKNOWN';
UPDATE nite_connect.documents
SET resource_owner_kind='INSTITUTION',origin='INSTITUTIONAL_RECORD',protection='ADMINISTRATIVE',
    protection_reason='Registro institucional legado'
WHERE context IN ('ADMINISTRATIVE','EVENT') AND resource_owner_kind='UNKNOWN';
-- An explicit diary link is stronger evidence than creator or containing folder.
UPDATE nite_connect.documents d
SET resource_owner_kind='INSTITUTION',resource_owner_id=NULL,origin='ACADEMIC_DIARY',
    protection='ACADEMIC',protection_reason='Diário de bordo vinculado ao histórico acadêmico',
    created_for=di.member_id
FROM nite_connect.diaries di WHERE di.document_id=d.id;

UPDATE nite_connect.document_folders
SET space_owner_id=owner_id,resource_owner_kind='INSTITUTION',origin='PERSONAL_SPACE',
    protection='ADMINISTRATIVE',protection_reason='Raiz estrutural pessoal'
WHERE kind='PERSONAL';
UPDATE nite_connect.document_folders
SET resource_owner_kind='PROJECT',resource_owner_id=project_id,origin='PROJECT_SPACE',
    protection='ADMINISTRATIVE',protection_reason='Raiz estrutural do projeto'
WHERE kind='PROJECT';
UPDATE nite_connect.document_folders
SET resource_owner_kind='INSTITUTION',origin='INSTITUTIONAL_SPACE',
    protection='ADMINISTRATIVE',protection_reason='Raiz estrutural institucional'
WHERE kind='ROOT';

WITH RECURSIVE ancestry AS (
  SELECT id,parent_id,kind,owner_id AS holder,project_id AS project,0 AS depth
  FROM nite_connect.document_folders WHERE kind IN ('PERSONAL','PROJECT','ROOT')
  UNION ALL
  SELECT child.id,child.parent_id,parent.kind,parent.holder,parent.project,parent.depth+1
  FROM nite_connect.document_folders child JOIN ancestry parent ON child.parent_id=parent.id
  WHERE child.kind='CUSTOM' AND parent.depth<63
)
UPDATE nite_connect.document_folders f
SET space_owner_id=CASE WHEN a.kind='PERSONAL' THEN a.holder END,
    resource_owner_kind=CASE
      WHEN a.kind='PERSONAL' AND f.created_by=a.holder THEN 'MEMBER'
      WHEN a.kind='PROJECT' THEN 'PROJECT'
      WHEN a.kind='ROOT' THEN 'INSTITUTION' ELSE 'UNKNOWN' END,
    resource_owner_id=CASE
      WHEN a.kind='PERSONAL' AND f.created_by=a.holder THEN a.holder
      WHEN a.kind='PROJECT' THEN a.project END,
    origin=CASE WHEN a.kind='PERSONAL' AND f.created_by=a.holder THEN 'PERSONAL_CREATED'
                WHEN a.kind='PROJECT' THEN 'PROJECT_CREATED'
                WHEN a.kind='ROOT' THEN 'INSTITUTIONAL_RECORD' ELSE 'LEGACY_UNKNOWN' END
FROM ancestry a WHERE f.id=a.id AND f.kind='CUSTOM';
