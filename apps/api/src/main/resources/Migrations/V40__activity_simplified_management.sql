-- Bloco 08.1: add activity planning fields without changing legacy IDs or assignments.
ALTER TABLE nite_connect.activities
    ADD COLUMN start_on date,
    ADD COLUMN priority varchar(8) CHECK (priority IN ('ALTA','MEDIA','BAIXA'));

ALTER TABLE nite_connect.activities ALTER COLUMN description SET DEFAULT '';
ALTER TABLE nite_connect.activities DROP CONSTRAINT activities_description_check;

-- Routine activity history may omit a user supplied justification.
ALTER TABLE nite_connect.activity_events ALTER COLUMN reason DROP NOT NULL;
ALTER TABLE nite_connect.activity_events DROP CONSTRAINT activity_events_reason_check;
ALTER TABLE nite_connect.activity_events ADD CONSTRAINT activity_events_reason_check
    CHECK (reason IS NULL OR length(trim(reason)) > 0);

CREATE INDEX activities_priority_due_idx ON nite_connect.activities(priority,due_on,id);
CREATE INDEX activities_start_idx ON nite_connect.activities(start_on,id);
