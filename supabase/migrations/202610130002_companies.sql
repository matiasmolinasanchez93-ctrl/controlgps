begin;
create table controlgps.companies (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(trim(name)) between 2 and 120),
 owner_id uuid not null references auth.users(id),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
-- Preserve the existing team in one company, without changing Auth or Business Helper.
do $$declare owner uuid;begin
 if exists(select 1 from controlgps.profiles) then
 select id into owner from controlgps.profiles where role='admin' order by created_at,id limit 1;
 if owner is null then raise exception 'Define un administrador inicial antes de migrar los datos existentes.';end if;
 insert into controlgps.companies(id,name,owner_id) values('00000000-0000-4000-8000-000000000001','Mi empresa',owner);
 end if;
end$$;
alter table controlgps.profiles add column company_id uuid references controlgps.companies(id);
alter table controlgps.projects add column company_id uuid references controlgps.companies(id);
alter table controlgps.project_assignments add column company_id uuid references controlgps.companies(id);
alter table controlgps.attendance_sessions add column company_id uuid references controlgps.companies(id);
alter table controlgps.location_events add column company_id uuid references controlgps.companies(id);
alter table controlgps.attendance_adjustments add column company_id uuid references controlgps.companies(id);
update controlgps.profiles set company_id='00000000-0000-4000-8000-000000000001';
update controlgps.projects set company_id='00000000-0000-4000-8000-000000000001';
update controlgps.project_assignments set company_id='00000000-0000-4000-8000-000000000001';
update controlgps.attendance_sessions set company_id='00000000-0000-4000-8000-000000000001';
update controlgps.location_events set company_id='00000000-0000-4000-8000-000000000001';
update controlgps.attendance_adjustments set company_id='00000000-0000-4000-8000-000000000001';
create function controlgps.current_company() returns uuid language sql stable security definer set search_path='' as $$select p.company_id from controlgps.profiles p join controlgps.companies c on c.id=p.company_id where p.id=auth.uid() and p.active and c.active$$;
create or replace function controlgps.is_active() returns boolean language sql stable security definer set search_path='' as $$select controlgps.current_company() is not null$$;
create or replace function controlgps.is_admin() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from controlgps.profiles where id=auth.uid() and role='admin' and active and company_id=controlgps.current_company())$$;
do $$declare t text;begin
 foreach t in array array['profiles','projects','project_assignments','attendance_sessions','location_events','attendance_adjustments'] loop
 execute format('alter table controlgps.%I alter column company_id set not null, alter column company_id set default controlgps.current_company()',t);
 execute format('alter table controlgps.%I add unique(company_id,id)',t);
 execute format('create index %I on controlgps.%I(company_id)',t||'_company_idx',t);
 end loop;
end$$;
alter table controlgps.projects add foreign key(company_id,created_by) references controlgps.profiles(company_id,id);
alter table controlgps.project_assignments add foreign key(company_id,project_id) references controlgps.projects(company_id,id),add foreign key(company_id,employee_id) references controlgps.profiles(company_id,id);
alter table controlgps.attendance_sessions add foreign key(company_id,project_id) references controlgps.projects(company_id,id),add foreign key(company_id,employee_id) references controlgps.profiles(company_id,id);
alter table controlgps.location_events add foreign key(company_id,attendance_session_id) references controlgps.attendance_sessions(company_id,id),add foreign key(company_id,employee_id) references controlgps.profiles(company_id,id),add foreign key(company_id,project_id) references controlgps.projects(company_id,id);
alter table controlgps.attendance_adjustments add foreign key(company_id,attendance_session_id) references controlgps.attendance_sessions(company_id,id),add foreign key(company_id,admin_id) references controlgps.profiles(company_id,id);
-- No membership is ever granted from user-editable Auth metadata.
create or replace function controlgps.new_profile() returns trigger language plpgsql security definer set search_path='' as $$begin return new;end$$;
create table controlgps.company_invitations (
 id uuid primary key default gen_random_uuid(),company_id uuid not null references controlgps.companies(id),
 email text not null check(email=lower(trim(email))),full_name text not null check(length(trim(full_name)) between 1 and 200),
 invited_by uuid not null references controlgps.profiles(id),expires_at timestamptz not null default now()+interval '7 days',
 accepted_at timestamptz,revoked_at timestamptz,created_at timestamptz not null default now(),unique(company_id,email),
 foreign key(company_id,invited_by) references controlgps.profiles(company_id,id)
);
alter table controlgps.companies enable row level security;
alter table controlgps.company_invitations enable row level security;
revoke all on controlgps.companies,controlgps.company_invitations from public,anon,authenticated;
grant select on controlgps.companies,controlgps.company_invitations to authenticated;
grant update(name) on controlgps.companies to authenticated;
create policy company_read on controlgps.companies for select to authenticated using(id=controlgps.current_company());
create policy company_update on controlgps.companies for update to authenticated using(id=controlgps.current_company() and controlgps.is_admin()) with check(id=controlgps.current_company() and controlgps.is_admin());
create policy invitation_read on controlgps.company_invitations for select to authenticated using(company_id=controlgps.current_company() and controlgps.is_admin());
drop policy profile_read on controlgps.profiles;
create policy profile_read on controlgps.profiles for select to authenticated using(id=auth.uid() or (company_id=controlgps.current_company() and controlgps.is_admin()));
drop policy project_read on controlgps.projects;
create policy project_read on controlgps.projects for select to authenticated using(company_id=controlgps.current_company() and (controlgps.is_admin() or exists(select 1 from controlgps.project_assignments a where a.project_id=projects.id and a.employee_id=auth.uid() and a.active) or exists(select 1 from controlgps.attendance_sessions s where s.project_id=projects.id and s.employee_id=auth.uid())));
drop policy project_insert on controlgps.projects;
create policy project_insert on controlgps.projects for insert to authenticated with check(company_id=controlgps.current_company() and controlgps.is_admin() and created_by=auth.uid());
drop policy project_update on controlgps.projects;
create policy project_update on controlgps.projects for update to authenticated using(company_id=controlgps.current_company() and controlgps.is_admin()) with check(company_id=controlgps.current_company() and controlgps.is_admin());
drop policy assignment_read on controlgps.project_assignments;
create policy assignment_read on controlgps.project_assignments for select to authenticated using(company_id=controlgps.current_company() and (controlgps.is_admin() or employee_id=auth.uid()));
drop policy assignment_insert on controlgps.project_assignments;
create policy assignment_insert on controlgps.project_assignments for insert to authenticated with check(company_id=controlgps.current_company() and controlgps.is_admin());
drop policy assignment_update on controlgps.project_assignments;
create policy assignment_update on controlgps.project_assignments for update to authenticated using(company_id=controlgps.current_company() and controlgps.is_admin()) with check(company_id=controlgps.current_company() and controlgps.is_admin());
drop policy session_read on controlgps.attendance_sessions;
create policy session_read on controlgps.attendance_sessions for select to authenticated using(company_id=controlgps.current_company() and (controlgps.is_admin() or employee_id=auth.uid()));
drop policy event_read on controlgps.location_events;
create policy event_read on controlgps.location_events for select to authenticated using(company_id=controlgps.current_company() and (controlgps.is_admin() or employee_id=auth.uid()));
drop policy adjustment_read on controlgps.attendance_adjustments;
create policy adjustment_read on controlgps.attendance_adjustments for select to authenticated using(company_id=controlgps.current_company() and controlgps.is_admin());
create function controlgps.require_verified_user() returns void language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null and email is not null) then raise exception 'Confirma tu correo electrónico antes de continuar.';end if;
end$$;
create function controlgps.create_company(p_name text,p_full_name text) returns uuid language plpgsql security definer set search_path='' as $$declare company uuid;begin
 perform controlgps.require_verified_user();
 if length(trim(coalesce(p_name,''))) not between 2 and 120 or length(trim(coalesce(p_full_name,''))) not between 2 and 200 then raise exception 'Escribe un nombre de empresa y un nombre completo válidos.';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if exists(select 1 from controlgps.profiles where id=auth.uid()) then raise exception 'Tu cuenta ya pertenece a una empresa. No se puede crear otra desde esta cuenta.';end if;
 insert into controlgps.companies(name,owner_id) values(trim(p_name),auth.uid()) returning id into company;
 insert into controlgps.profiles(id,full_name,email,role,company_id) select id,trim(p_full_name),email,'admin',company from auth.users where id=auth.uid();
 return company;
end$$;
create function controlgps.prepare_invitation(p_email text,p_name text) returns uuid language plpgsql security definer set search_path='' as $$declare invitation uuid;company uuid:=controlgps.current_company();begin
 if not controlgps.is_admin() then raise exception 'Acceso denegado.';end if;
 if length(trim(coalesce(p_name,''))) not between 1 and 200 or length(coalesce(p_email,''))>254 or trim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Nombre y correo válidos requeridos.';end if;
 if exists(select 1 from controlgps.profiles where lower(email)=lower(trim(p_email))) then raise exception 'Esta cuenta ya pertenece a una empresa. Usa otra cuenta para otra empresa.';end if;
 insert into controlgps.company_invitations(company_id,email,full_name,invited_by) values(company,lower(trim(p_email)),trim(p_name),auth.uid()) on conflict(company_id,email) do update set full_name=excluded.full_name,invited_by=excluded.invited_by,expires_at=now()+interval '7 days',revoked_at=null,accepted_at=null returning id into invitation;
 return invitation;
end$$;
create or replace function controlgps.enroll_employee(p_email text,p_name text) returns uuid language plpgsql security definer set search_path='' as $$begin return controlgps.prepare_invitation(p_email,p_name);end$$;
create function controlgps.my_invitations() returns table(id uuid,company_name text,full_name text,expires_at timestamptz) language plpgsql security definer set search_path='' as $$begin
 perform controlgps.require_verified_user();
 return query select i.id,c.name,i.full_name,i.expires_at from controlgps.company_invitations i join controlgps.companies c on c.id=i.company_id join auth.users u on u.id=auth.uid() and lower(u.email)=i.email where i.accepted_at is null and i.revoked_at is null and i.expires_at>now() and c.active order by i.created_at desc;
end$$;
create function controlgps.accept_invitation(p_invitation uuid) returns uuid language plpgsql security definer set search_path='' as $$declare i controlgps.company_invitations;begin
 perform controlgps.require_verified_user();
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if exists(select 1 from controlgps.profiles where id=auth.uid()) then raise exception 'Tu cuenta ya pertenece a una empresa.';end if;
 select inv.* into i from controlgps.company_invitations inv join auth.users u on u.id=auth.uid() and lower(u.email)=inv.email join controlgps.companies c on c.id=inv.company_id and c.active where inv.id=p_invitation and inv.accepted_at is null and inv.revoked_at is null and inv.expires_at>now() for update of inv;
 if not found then raise exception 'La invitación no es válida, expiró o pertenece a otro correo.';end if;
 insert into controlgps.profiles(id,company_id,full_name,email,role) values(auth.uid(),i.company_id,i.full_name,i.email,'employee');
 update controlgps.company_invitations set accepted_at=now() where id=i.id;
 return i.company_id;
end$$;
create function controlgps.revoke_invitation(p_invitation uuid) returns void language plpgsql security definer set search_path='' as $$begin
 if not controlgps.is_admin() then raise exception 'Acceso denegado.';end if;
 update controlgps.company_invitations set revoked_at=now() where id=p_invitation and company_id=controlgps.current_company() and accepted_at is null;
 if not found then raise exception 'Invitación no disponible.';end if;
end$$;
create or replace function controlgps.set_employee_active(p_employee uuid,p_active boolean) returns void language plpgsql security definer set search_path='' as $$begin
 if not controlgps.is_admin() then raise exception 'Acceso denegado.';end if;
 update controlgps.profiles set active=p_active where id=p_employee and role='employee' and company_id=controlgps.current_company();
 if not found then raise exception 'Empleado no encontrado en tu empresa.';end if;
end$$;
revoke execute on function controlgps.current_company(),controlgps.require_verified_user(),controlgps.create_company(text,text),controlgps.prepare_invitation(text,text),controlgps.my_invitations(),controlgps.accept_invitation(uuid),controlgps.revoke_invitation(uuid) from public,anon,authenticated;
grant execute on function controlgps.current_company(),controlgps.create_company(text,text),controlgps.prepare_invitation(text,text),controlgps.my_invitations(),controlgps.accept_invitation(uuid),controlgps.revoke_invitation(uuid) to authenticated;
-- Existing attendance RPC implementations are replaced below with explicit company scope.
create or replace function controlgps.check_in(p_project uuid,p_lat double precision,p_lng double precision,p_accuracy double precision,p_measured timestamptz) returns controlgps.attendance_sessions language plpgsql security definer set search_path='' as $$declare p controlgps.projects;s controlgps.attendance_sessions;begin
 if not controlgps.is_active() then raise exception 'Cuenta inactiva o sesión expirada.';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if exists(select 1 from controlgps.attendance_sessions where employee_id=auth.uid() and company_id=controlgps.current_company() and check_out_at is null) then raise exception 'Ya tienes una jornada abierta.';end if;
 select * into p from controlgps.projects where id=p_project and company_id=controlgps.current_company() for share;
 if not found or not p.active then raise exception 'El proyecto está archivado o no existe.';end if;
 perform 1 from controlgps.project_assignments where project_id=p_project and employee_id=auth.uid() and active for share;
 if not found then raise exception 'No estás asignado a este proyecto.';end if;
 perform controlgps.validate_gps(p_lat,p_lng,p_accuracy,p_measured);
 if controlgps.distance_m(p_lat,p_lng,p.latitude,p.longitude)>p.radius_m then raise exception 'Estás fuera de la zona permitida.';end if;
 insert into controlgps.attendance_sessions(employee_id,project_id,check_in_latitude,check_in_longitude,check_in_accuracy_m) values(auth.uid(),p.id,p_lat,p_lng,p_accuracy) returning * into s;
 insert into controlgps.monitor_state(session_id,last_measurement,last_received) values(s.id,p_measured,now());
 insert into controlgps.location_events(attendance_session_id,employee_id,project_id,event_type,latitude,longitude,accuracy_m,measured_at) values(s.id,auth.uid(),p.id,'inside',p_lat,p_lng,p_accuracy,p_measured);
 return s;end$$;
create or replace function controlgps.check_out(p_lat double precision default null,p_lng double precision default null,p_accuracy double precision default null,p_measured timestamptz default null,p_reason text default null) returns controlgps.attendance_sessions language plpgsql security definer set search_path='' as $$declare s controlgps.attendance_sessions;p controlgps.projects;begin
 if not controlgps.is_active() then raise exception 'Cuenta inactiva o sesión expirada.';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select * into s from controlgps.attendance_sessions where employee_id=auth.uid() and company_id=controlgps.current_company() and check_out_at is null for update;
 if not found then raise exception 'No tienes una jornada abierta.';end if;
 select * into p from controlgps.projects where id=s.project_id;
 if p_lat is not null or p_lng is not null or p_accuracy is not null then
 perform controlgps.validate_gps(p_lat,p_lng,p_accuracy,p_measured);
 if controlgps.distance_m(p_lat,p_lng,p.latitude,p.longitude)>p.radius_m and length(trim(coalesce(p_reason,'')))<5 then raise exception 'Indica el motivo de salida fuera de zona (mínimo 5 caracteres).';end if;
 elsif length(trim(coalesce(p_reason,'')))<5 then raise exception 'Indica el motivo de salida sin GPS (mínimo 5 caracteres).';end if;
 update controlgps.attendance_sessions set check_out_at=clock_timestamp(),check_out_latitude=p_lat,check_out_longitude=p_lng,check_out_accuracy_m=p_accuracy,check_out_reason=nullif(trim(p_reason),'') where id=s.id returning * into s;return s;end$$;
create or replace function controlgps.record_location(p_session uuid,p_lat double precision default null,p_lng double precision default null,p_accuracy double precision default null,p_measured timestamptz default null,p_signal text default null) returns text language plpgsql security definer set search_path='' as $$declare s controlgps.attendance_sessions;p controlgps.projects;m controlgps.monitor_state;z text;d double precision;begin
 if not controlgps.is_active() then raise exception 'Cuenta inactiva o sesión expirada.';end if;
 select * into s from controlgps.attendance_sessions where id=p_session and company_id=controlgps.current_company() and employee_id=auth.uid() and check_out_at is null for update;
 if not found then raise exception 'No tienes una jornada abierta.';end if;
 select * into p from controlgps.projects where id=s.project_id;
 select * into m from controlgps.monitor_state where session_id=s.id for update;
 if p_signal is not null then
 if p_signal not in ('gps_unavailable','monitoring_resumed') then raise exception 'Señal inválida.';end if;
 update controlgps.monitor_state set outside_count=0 where session_id=s.id;
 if exists(select 1 from controlgps.location_events where attendance_session_id=s.id and event_type=p_signal and recorded_at>now()-interval '30 seconds') then return p_signal;end if;
 insert into controlgps.location_events(attendance_session_id,employee_id,project_id,event_type) values(s.id,auth.uid(),s.project_id,p_signal);return p_signal;end if;
 perform controlgps.validate_gps(p_lat,p_lng,p_accuracy,p_measured);
 if p_measured<=m.last_measurement then return m.zone;end if;
 d=controlgps.distance_m(p_lat,p_lng,p.latitude,p.longitude);z=m.zone;
 if m.last_received<now()-interval '120 seconds' then m.outside_count=0;end if;
 if d>p.radius_m+15 then m.outside_count=m.outside_count+1;if m.outside_count>=2 then z='outside';end if;
 else m.outside_count=0;if d<=p.radius_m then z='inside';end if;end if;
 update controlgps.monitor_state set zone=z,outside_count=m.outside_count,last_measurement=p_measured,last_received=now() where session_id=s.id;
 -- Two initial outside samples must not create a false inside heartbeat.
 if z<>m.zone or (d<=p.radius_m and not exists(select 1 from controlgps.location_events where attendance_session_id=s.id and event_type='inside' and recorded_at>now()-interval '30 seconds')) or (z='outside' and d>p.radius_m+15 and not exists(select 1 from controlgps.location_events where attendance_session_id=s.id and event_type='outside' and recorded_at>now()-interval '30 seconds')) then
 insert into controlgps.location_events(attendance_session_id,employee_id,project_id,event_type,latitude,longitude,accuracy_m,measured_at) values(s.id,auth.uid(),s.project_id,z,p_lat,p_lng,p_accuracy,p_measured);end if;
 return z;end$$;
create or replace function controlgps.adjust_attendance(p_session uuid,p_in timestamptz,p_out timestamptz,p_reason text) returns void language plpgsql security definer set search_path='' as $$declare old controlgps.attendance_sessions;n controlgps.attendance_sessions;begin
 if not controlgps.is_admin() then raise exception 'Acceso denegado.';end if;
 if length(trim(coalesce(p_reason,'')))<5 then raise exception 'Indica un motivo de al menos 5 caracteres.';end if;
 select * into old from controlgps.attendance_sessions where id=p_session and company_id=controlgps.current_company() for update;
 if not found then raise exception 'Registro no encontrado.';end if;
 if p_in is null or p_in>now() or p_out>now() or p_out<p_in then raise exception 'Horario inválido.';end if;
 update controlgps.attendance_sessions set check_in_at=p_in,check_out_at=p_out where id=p_session returning * into n;
 insert into controlgps.attendance_adjustments(attendance_session_id,admin_id,reason,previous_values,new_values) values(p_session,auth.uid(),p_reason,to_jsonb(old),to_jsonb(n));end$$;
commit;
