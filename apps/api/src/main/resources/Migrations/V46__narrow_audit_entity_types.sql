ALTER TABLE nite_connect.audit_events DROP CONSTRAINT audit_entity_check;
ALTER TABLE nite_connect.audit_events ADD CONSTRAINT audit_entity_check CHECK (
 (entity_type='MEMBER' AND member_id IS NOT NULL AND (entity_id IS NULL OR entity_id=member_id)) OR
 (entity_type IN ('PROJECT','PROPOSAL','ACTIVITY','EVIDENCE','CALENDAR_EVENT','ATTENDANCE','ATTENDANCE_SEGMENT',
                  'DOCUMENT','DOCUMENT_TEMPLATE','ACTIVITY_PLANNING')
  AND entity_id IS NOT NULL AND member_id IS NULL)
);
