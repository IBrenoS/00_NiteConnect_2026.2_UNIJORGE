-- B10.0C-F: distinguish idempotent empty-trash requests from one-item voluntary requests.
ALTER TABLE nite_connect.document_purge_operations
  DROP CONSTRAINT document_purge_operations_operation_type_check;
ALTER TABLE nite_connect.document_purge_operations
  ADD CONSTRAINT document_purge_operations_operation_type_check
  CHECK (operation_type IN ('ITEM','EMPTY','AUTO','VOLUNTARY','VOLUNTARY_EMPTY'));
