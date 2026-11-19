select json_build_object(
'project',(select json_build_object('id',id,'title',title,'status',status,'version',version,'startsOn',starts_on,'endsOn',ends_on,'acceptingMembers',accepting_members,'createdAt',created_at) from nite_connect.projects where id='d298180f-939f-493b-9960-d4b2fd24d640'),
'currentMemberships',(select count(*) from nite_connect.project_memberships where project_id='d298180f-939f-493b-9960-d4b2fd24d640' and ended_at is null),
'membershipStartedAfterCreation',(select bool_and(m.started_at>p.created_at) from nite_connect.project_memberships m join nite_connect.projects p on p.id=m.project_id where p.id='d298180f-939f-493b-9960-d4b2fd24d640'),
'leadershipPeriods',(select count(*) from nite_connect.project_leadership_history where project_id='d298180f-939f-493b-9960-d4b2fd24d640'),
'statusHistory',(select json_agg(json_build_object('from',previous_status,'to',new_status,'reason',reason,'occurredAt',occurred_at) order by occurred_at) from nite_connect.project_status_history where project_id='d298180f-939f-493b-9960-d4b2fd24d640'),
'audit',(select json_agg(json_build_object('action',action,'reason',reason,'occurredAt',occurred_at) order by occurred_at) from nite_connect.audit_events where entity_type='PROJECT' and entity_id='d298180f-939f-493b-9960-d4b2fd24d640')
);
