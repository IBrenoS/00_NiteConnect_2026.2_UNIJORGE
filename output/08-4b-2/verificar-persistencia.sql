select json_build_object(
'projects',(select json_agg(json_build_object('id',id,'status',status,'version',version,'acceptingMembers',accepting_members)) from nite_connect.projects where title like 'HOMOLOGAÇÃO 08.4B-2%'),
'currentMemberships',(select count(*) from nite_connect.project_memberships m join nite_connect.projects p on p.id=m.project_id where p.title like 'HOMOLOGAÇÃO 08.4B-2%' and m.ended_at is null),
'plannings',(select json_agg(json_build_object('id',a.id,'projectId',a.project_id,'version',a.version)) from nite_connect.activity_plannings a join nite_connect.projects p on p.id=a.project_id where p.title like 'HOMOLOGAÇÃO 08.4B-2%'),
'tasks',(select json_agg(json_build_object('id',a.id,'projectId',a.project_id,'planningId',a.planning_id,'status',a.status,'version',a.version)) from nite_connect.activities a join nite_connect.projects p on p.id=a.project_id where p.title like 'HOMOLOGAÇÃO 08.4B-2%'),
'interests',(select count(*) from nite_connect.project_interest_signals i join nite_connect.projects p on p.id=i.project_id where p.title like 'HOMOLOGAÇÃO 08.4B-2%' and i.withdrawn_at is null),
'activeInstitutionalMembers',(select count(*) from nite_connect.members where status='ATIVO'),
'v43',(select json_build_object('checksum',checksum,'success',success) from public.flyway_schema_history where version='43'),
'preservedAttendanceSegmentAudit',(select count(*) from nite_connect.audit_events where entity_type='ATTENDANCE_SEGMENT')
);
