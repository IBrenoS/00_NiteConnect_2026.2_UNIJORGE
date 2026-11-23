-- B10.0C: voluntary purge of a member's own unprotected documents is a distinct
-- operation and does not depend on automatic-retention policy activation.
ALTER TABLE nite_connect.document_purge_operations
  DROP CONSTRAINT document_purge_operations_operation_type_check;
ALTER TABLE nite_connect.document_purge_operations
  ADD CONSTRAINT document_purge_operations_operation_type_check
  CHECK (operation_type IN ('ITEM','EMPTY','AUTO','VOLUNTARY'));
