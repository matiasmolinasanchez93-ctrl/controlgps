-- Set controlgps.smoke_user_ids to a PostgreSQL uuid[] literal before running.
do $$declare ids uuid[];smoke_companies uuid[];begin
 ids=current_setting('controlgps.smoke_user_ids')::uuid[];
 select array_agg(id) into ids from auth.users where id=any(ids) and email ~ '^cg-smoke-(owner|worker|weak)-[0-9a-f]{16}@invalid\.example$';
 if ids is null then return;end if;
 select array_agg(id) into smoke_companies from controlgps.companies where owner_id=any(ids);
 delete from controlgps.access_attempts where actor in(select 'recovery:'||encode(sha256(convert_to(lower(email),'UTF8')),'hex') from auth.users where id=any(ids)) or actor in(select 'invite:'||unnest(ids)::text);
 delete from controlgps.invitation_secrets where invitation_id in(select id from controlgps.company_invitations where company_id=any(smoke_companies));
 delete from controlgps.recovery_secrets where user_id=any(ids);
 delete from controlgps.attendance_adjustments where company_id=any(smoke_companies);
 delete from controlgps.location_events where company_id=any(smoke_companies);
 delete from controlgps.monitor_state where session_id in(select id from controlgps.attendance_sessions where company_id=any(smoke_companies));
 delete from controlgps.project_assignments where company_id=any(smoke_companies);
 delete from controlgps.attendance_sessions where company_id=any(smoke_companies);
 delete from controlgps.projects where company_id=any(smoke_companies);
 delete from controlgps.company_invitations where company_id=any(smoke_companies);
 delete from controlgps.profiles where company_id=any(smoke_companies) or id=any(ids);
 delete from controlgps.companies where id=any(smoke_companies);
 if to_regclass('public.profiles') is not null then execute 'delete from public.profiles where id=any($1)' using ids;end if;
 delete from auth.users where id=any(ids);
 if exists(select 1 from auth.users where id=any(ids)) then raise exception 'No se completó la limpieza de cuentas temporales';end if;
end$$;
