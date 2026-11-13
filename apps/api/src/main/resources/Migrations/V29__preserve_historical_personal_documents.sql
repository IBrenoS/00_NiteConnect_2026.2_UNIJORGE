-- Provision a private folder for every inactive member who still owns personal records.
-- Preserve document, version and object identifiers from V6/V27.
INSERT INTO nite_connect.document_folders(id,parent_id,name,kind,owner_id)
SELECT gen_random_uuid(),r.id,
       CASE WHEN EXISTS (
           SELECT 1 FROM nite_connect.members s
           WHERE lower(btrim(s.name))=lower(btrim(m.name)) AND s.id<>m.id
       ) THEN left(m.name,170)||' ('||left(m.id::text,8)||')' ELSE left(m.name,190) END,
       'PERSONAL',m.id
FROM nite_connect.members m
CROSS JOIN nite_connect.document_folders r
WHERE r.system_key='INTEGRANTES'
  AND EXISTS (SELECT 1 FROM nite_connect.documents d WHERE d.context='PERSONAL' AND d.owner_id=m.id)
  AND NOT EXISTS (SELECT 1 FROM nite_connect.document_folders f WHERE f.owner_id=m.id AND f.kind='PERSONAL' AND f.archived_at IS NULL);

UPDATE nite_connect.documents d
SET folder_id=f.id,
    modified_by=coalesce(d.modified_by,(SELECT v.created_by FROM nite_connect.document_versions v WHERE v.id=d.current_version_id),d.created_by),
    modified_at=coalesce((SELECT v.created_at FROM nite_connect.document_versions v WHERE v.id=d.current_version_id),d.created_at)
FROM nite_connect.document_folders f
WHERE d.context='PERSONAL' AND d.owner_id=f.owner_id AND f.kind='PERSONAL' AND d.folder_id IS NULL;

