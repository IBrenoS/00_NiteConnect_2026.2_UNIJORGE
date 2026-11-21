-- B08.6-0: institutional role is independent from contextual project leadership.
ALTER TABLE nite_connect.role_assignments DROP CONSTRAINT role_assignments_role_check;
ALTER TABLE nite_connect.role_assignments ADD CONSTRAINT role_assignments_role_check
    CHECK (role IN ('COORDENADOR', 'GESTOR_GERAL', 'GESTOR_PROJETO'));

-- Preserve superior assignments. A current leader without an institutional
-- leadership-eligible role receives a technical, traceable regularization.
WITH candidates AS (
    SELECT DISTINCT ON (l.member_id) l.member_id, l.started_by
    FROM nite_connect.project_leadership_history l
    WHERE l.ended_at IS NULL
      AND NOT EXISTS (
          SELECT 1 FROM nite_connect.role_assignments r
          WHERE r.member_id = l.member_id
            AND r.role IN ('COORDENADOR', 'GESTOR_GERAL', 'GESTOR_PROJETO'))
    ORDER BY l.member_id, l.started_at, l.id
), granted AS (
    INSERT INTO nite_connect.role_assignments(member_id, role, granted_by, reason)
    SELECT member_id, 'GESTOR_PROJETO', started_by,
           'Regularização técnica B08.6-0: liderança vigente anterior ao papel institucional'
    FROM candidates
    RETURNING member_id
)
INSERT INTO nite_connect.audit_events(id, actor_id, member_id, action, before_value, after_value, reason)
SELECT gen_random_uuid(), c.started_by, g.member_id, 'ROLE_GRANTED', NULL, 'GESTOR_PROJETO',
       'Regularização técnica B08.6-0: liderança vigente anterior ao papel institucional'
FROM granted g JOIN candidates c ON c.member_id = g.member_id;

CREATE FUNCTION nite_connect.require_project_leadership_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM nite_connect.role_assignments r
        WHERE r.member_id = NEW.member_id
          AND r.role IN ('COORDENADOR', 'GESTOR_GERAL', 'GESTOR_PROJETO')) THEN
        RAISE EXCEPTION 'Current project leader requires an institutional leadership role';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER project_leadership_requires_role
    BEFORE INSERT ON nite_connect.project_leadership_history
    FOR EACH ROW EXECUTE FUNCTION nite_connect.require_project_leadership_role();

CREATE FUNCTION nite_connect.preserve_project_leadership_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.role IN ('COORDENADOR', 'GESTOR_GERAL', 'GESTOR_PROJETO')
       AND EXISTS (SELECT 1 FROM nite_connect.project_leadership_history l
                   WHERE l.member_id = OLD.member_id AND l.ended_at IS NULL)
       AND NOT EXISTS (SELECT 1 FROM nite_connect.role_assignments r
                       WHERE r.member_id = OLD.member_id AND r.role <> OLD.role
                         AND r.role IN ('COORDENADOR', 'GESTOR_GERAL', 'GESTOR_PROJETO')) THEN
        RAISE EXCEPTION 'Current project leader requires an institutional leadership role';
    END IF;
    RETURN OLD;
END;
$$;
CREATE TRIGGER preserve_project_leadership_role
    BEFORE DELETE ON nite_connect.role_assignments
    FOR EACH ROW EXECUTE FUNCTION nite_connect.preserve_project_leadership_role();
