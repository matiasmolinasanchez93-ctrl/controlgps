-- Actual hosted database, read/write security checks rolled back completely.
begin;
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at)
values('fd000000-0000-4000-8000-000000000001','controlgps-test-a@invalid.example','{}',now()),
('fd000000-0000-4000-8000-000000000002','controlgps-test-b@invalid.example','{}',now()),
('fd000000-0000-4000-8000-000000000003','controlgps-test-e@invalid.example','{}',now());
select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select controlgps.create_company('Prueba temporal A','Administrador A');
insert into controlgps.projects(id,name,latitude,longitude) values('fd000000-0000-4000-8000-000000000004','Obra temporal A',0,0);
do $$declare private_code text; result jsonb; begin
 private_code := controlgps.issue_invitation_code('controlgps-test-e@invalid.example','Empleado temporal')->>'code';
 perform set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000003',true);
 result := controlgps.accept_invitation_code(private_code);
 if not (result->>'ok')::boolean then raise exception 'No se aceptó el código privado'; end if;
end$$;
select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000001',true);
insert into controlgps.project_assignments(project_id,employee_id) values('fd000000-0000-4000-8000-000000000004','fd000000-0000-4000-8000-000000000003');
select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000003',true);
select controlgps.check_in('fd000000-0000-4000-8000-000000000004',0,0,10,now());
select controlgps.record_location((select id from controlgps.attendance_sessions limit 1),.002,0,10,clock_timestamp());
select controlgps.record_location((select id from controlgps.attendance_sessions limit 1),.002,0,10,clock_timestamp()+interval '1 millisecond');
do $$begin
 if not exists(select 1 from controlgps.location_events where event_type='outside') then raise exception 'No se detectó salida de zona';end if;
 if not exists(select 1 from controlgps.attendance_sessions where check_out_at is null) then raise exception 'La salida de zona cerró la jornada';end if;
end$$;
select controlgps.check_out(.01,0,10,clock_timestamp(),'Salida de prueba fuera de zona');
select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000002',true);
select controlgps.create_company('Prueba temporal B','Administrador B');
do $$begin
 if exists(select 1 from controlgps.projects) or exists(select 1 from controlgps.attendance_sessions) or exists(select 1 from controlgps.location_events) then raise exception 'Aislamiento entre empresas falló';end if;
 begin
 perform controlgps.set_employee_active('fd000000-0000-4000-8000-000000000003',false);
 raise exception 'Se permitió desactivar empleado ajeno';
 exception when others then if sqlerrm not like '%Empleado no encontrado%' then raise;end if;end;
end$$;
rollback;
