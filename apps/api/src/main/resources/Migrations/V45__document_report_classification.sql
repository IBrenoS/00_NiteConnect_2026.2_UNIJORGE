-- Classification is explicit; no existing file or grant becomes a report by inference.
ALTER TABLE nite_connect.documents ADD COLUMN classification varchar(12) NOT NULL DEFAULT 'GENERAL'
 CHECK (classification IN ('GENERAL','REPORT'));
CREATE INDEX document_report_classification_idx ON nite_connect.documents(folder_id,id)
 WHERE classification='REPORT' AND lifecycle_state='ACTIVE' AND archived_at IS NULL AND space_owner_id IS NULL;
