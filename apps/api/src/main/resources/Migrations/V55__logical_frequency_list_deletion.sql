ALTER TABLE nite_connect.attendance_lists
    ADD COLUMN deleted_at timestamptz,
    ADD COLUMN deleted_by uuid REFERENCES nite_connect.members(id),
    ADD CONSTRAINT attendance_lists_deleted_actor_check
        CHECK ((deleted_at IS NULL) = (deleted_by IS NULL));

CREATE INDEX attendance_lists_visible_opened_idx
    ON nite_connect.attendance_lists(opened_at DESC, id)
    WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION nite_connect.protect_attendance_list() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION 'Attendance lists cannot be deleted';
    END IF;
    IF NEW.id<>OLD.id OR NEW.calendar_event_id<>OLD.calendar_event_id OR NEW.meeting_name<>OLD.meeting_name
       OR NEW.classification<>OLD.classification OR NEW.counts_for_frequency<>OLD.counts_for_frequency
       OR NEW.confirmation_window_minutes<>OLD.confirmation_window_minutes OR NEW.confirmation_deadline<>OLD.confirmation_deadline
       OR NEW.opened_at<>OLD.opened_at OR NEW.opened_by<>OLD.opened_by
       OR NEW.idempotency_key<>OLD.idempotency_key OR NEW.request_hash<>OLD.request_hash OR NEW.created_at<>OLD.created_at
       OR NEW.version<>OLD.version+1 THEN
        RAISE EXCEPTION 'Attendance list identity is immutable and version must advance' USING ERRCODE='23514';
    END IF;
    IF OLD.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'Deleted attendance lists are immutable' USING ERRCODE='23514';
    END IF;
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND OLD.status='ABERTA' THEN
        RAISE EXCEPTION 'Open attendance lists must be closed before deletion' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
