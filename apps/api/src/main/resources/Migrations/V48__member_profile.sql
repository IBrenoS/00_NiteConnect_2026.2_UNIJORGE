ALTER TABLE nite_connect.members
    ADD COLUMN course varchar(160),
    ADD COLUMN practice_area varchar(160),
    ADD COLUMN birth_date date,
    ADD COLUMN photo_object_id uuid,
    ADD COLUMN photo_content_type varchar(32),
    ADD CONSTRAINT member_profile_course_check CHECK (course IS NULL OR length(trim(course)) > 0),
    ADD CONSTRAINT member_profile_area_check CHECK (practice_area IS NULL OR length(trim(practice_area)) > 0),
    ADD CONSTRAINT member_profile_photo_check CHECK ((photo_object_id IS NULL AND photo_content_type IS NULL)
        OR (photo_object_id IS NOT NULL AND photo_content_type IN ('image/jpeg', 'image/png')));
