begin;
create schema controlgps;
grant usage on schema controlgps to anon,authenticated,service_role;

create table controlgps.profiles(id uuid primary key references auth.users(id),full_name text not null check(length(trim(full_name))>0),email text not null,role text not null default 'employee' check(role in ('admin','employee')),active boolean not null default true,created_at timestamptz not null default now());
create table controlgps.projects(id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name))>0),description text,address text,latitude double precision not null check(latitude between -90 and 90),longitude double precision not null check(longitude between -180 and 180),radius_m integer not null default 100 check(radius_m between 10 and 10000),active boolean not null default true,created_by uuid not null references controlgps.profiles(id) default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table controlgps.project_assignments(id uuid primary key default gen_random_uuid(),project_id uuid not null references controlgps.projects(id),employee_id uuid not null references controlgps.profiles(id),active boolean not null default true,created_at timestamptz not null default now(),unique(project_id,employee_id));
create table controlgps.attendance_sessions(id uuid primary key default gen_random_uuid(),employee_id uuid not null references controlgps.profiles(id),project_id uuid not null references controlgps.projects(id),check_in_at timestamptz not null default now(),check_out_at timestamptz,check_in_latitude double precision,check_in_longitude double precision,check_in_accuracy_m double precision,check_out_latitude double precision,check_out_longitude double precision,check_out_accuracy_m double precision,check_out_reason text,created_at timestamptz not null default now(),constraint check_out_after_check_in check(check_out_at>=check_in_at));
create unique index one_open_shift on controlgps.attendance_sessions(employee_id) where check_out_at is null;
create index sessions_date on controlgps.attendance_sessions(check_in_at);
create table controlgps.location_events(id uuid primary key default gen_random_uuid(),attendance_session_id uuid not null references controlgps.attendance_sessions(id),employee_id uuid not null references controlgps.profiles(id),project_id uuid not null references controlgps.projects(id),event_type text not null check(event_type in ('inside','outside','gps_unavailable','monitoring_resumed')),latitude double precision,longitude double precision,accuracy_m double precision,measured_at timestamptz,recorded_at timestamptz not null default now(),created_at timestamptz not null default now());
create index events_session_time on controlgps.location_events(attendance_session_id,recorded_at desc);
create table controlgps.attendance_adjustments(id uuid primary key default gen_random_uuid(),attendance_session_id uuid not null references controlgps.attendance_sessions(id),admin_id uuid not null references controlgps.profiles(id),reason text not null check(length(trim(reason))>=5),previous_values jsonb not null,new_values jsonb not null,created_at timestamptz not null default now());
-- Server-owned monitor state: no direct client privileges.
create table controlgps.monitor_state(session_id uuid primary key references controlgps.attendance_sessions(id),outside_count integer not null default 0,zone text not null default 'inside',last_measurement timestamptz,last_received timestamptz);
alter table controlgps.monitor_state enable row level security;
create function controlgps.is_active() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from controlgps.profiles where id=auth.uid() and active)$$;
create function controlgps.is_admin() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from controlgps.profiles where id=auth.uid() and role='admin' and active)$$;
create function controlgps.new_profile() returns trigger language plpgsql security definer set search_path='' as $$begin if new.raw_user_meta_data->>'controlgps_enrolled'='true' then insert into controlgps.profiles(id,full_name,email) values(new.id,coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''),split_part(new.email,'@',1)),new.email);end if;return new;end$$;
create trigger on_controlgps_auth_user_created after insert on auth.users for each row execute function controlgps.new_profile();
create function controlgps.touch_project() returns trigger language plpgsql set search_path='' as $$begin new.updated_at=now();return new;end$$;
create trigger project_updated before update on controlgps.projects for each row execute function controlgps.touch_project();
alter table controlgps.profiles enable row level security;
alter table controlgps.projects enable row level security;
alter table controlgps.project_assignments enable row level security;
alter table controlgps.attendance_sessions enable row level security;
alter table controlgps.location_events enable row level security;
alter table controlgps.attendance_adjustments enable row level security;
create policy profile_read on controlgps.profiles for select to authenticated using(id=auth.uid() or controlgps.is_admin());
create policy project_read on controlgps.projects for select to authenticated using(controlgps.is_admin() or (controlgps.is_active() and (exists(select 1 from controlgps.project_assignments a where a.project_id=projects.id and a.employee_id=auth.uid() and a.active) or exists(select 1 from controlgps.attendance_sessions s where s.project_id=projects.id and s.employee_id=auth.uid()))));
create policy project_insert on controlgps.projects for insert to authenticated with check(controlgps.is_admin() and created_by=auth.uid());
create policy project_update on controlgps.projects for update to authenticated using(controlgps.is_admin()) with check(controlgps.is_admin());
create policy assignment_read on controlgps.project_assignments for select to authenticated using(controlgps.is_admin() or (controlgps.is_active() and employee_id=auth.uid()));
create policy assignment_insert on controlgps.project_assignments for insert to authenticated with check(controlgps.is_admin());
create policy assignment_update on controlgps.project_assignments for update to authenticated using(controlgps.is_admin()) with check(controlgps.is_admin());
create policy session_read on controlgps.attendance_sessions for select to authenticated using(controlgps.is_admin() or (controlgps.is_active() and employee_id=auth.uid()));
create policy event_read on controlgps.location_events for select to authenticated using(controlgps.is_admin() or (controlgps.is_active() and employee_id=auth.uid()));
create policy adjustment_read on controlgps.attendance_adjustments for select to authenticated using(controlgps.is_admin());
revoke all on controlgps.profiles,controlgps.projects,controlgps.project_assignments,controlgps.attendance_sessions,controlgps.location_events,controlgps.attendance_adjustments,controlgps.monitor_state from anon,authenticated;
grant select on controlgps.profiles,controlgps.projects,controlgps.project_assignments,controlgps.attendance_sessions,controlgps.location_events,controlgps.attendance_adjustments to authenticated;
grant insert,update on controlgps.projects,controlgps.project_assignments to authenticated;
create function controlgps.distance_m(a double precision,b double precision,c double precision,d double precision) returns double precision language sql immutable set search_path='' as $$select 6371000*2*asin(sqrt(least(1.0,power(sin(radians(c-a)/2),2)+cos(radians(a))*cos(radians(c))*power(sin(radians(d-b)/2),2))))$$;
create function controlgps.validate_gps(lat double precision,lng double precision,acc double precision,measured timestamptz) returns void language plpgsql set search_path='' as $$begin
 if lat is null or lng is null or not(lat between -90 and 90) or not(lng between -180 and 180) then raise exception 'Coordenadas inválidas.';end if;
 if acc is null or not(acc between 0 and 50) then raise exception 'Precisión insuficiente. Se requiere 50 m o mejor.';end if;
 if measured is null or measured<clock_timestamp()-interval '30 seconds' or measured>clock_timestamp()+interval '5 seconds' then raise exception 'La lectura GPS no es reciente.';end if;
end$$;
create function controlgps.check_in(p_project uuid,p_lat double precision,p_lng double precision,p_accuracy double precision,p_measured timestamptz) returns controlgps.attendance_sessions language plpgsql security definer set search_path='' as $$declare p controlgps.projects;s controlgps.attendance_sessions;begin
 if not controlgps.is_active() then raise exception 'Cuenta inactiva o sesión expirada.';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if exists(select 1 from controlgps.attendance_sessions where employee_id=auth.uid() and check_out_at is null) then raise exception 'Ya tienes una jornada abierta.';end if;
 select * into p from controlgps.projects where id=p_project for share;
 if not found or not p.active then raise exception 'El proyecto está archivado o no existe.';end if;
 perform 1 from controlgps.project_assignments where project_id=p_project and employee_id=auth.uid() and active for share;
 if not found then raise exception 'No estás asignado a este proyecto.';end if;
 perform controlgps.validate_gps(p_lat,p_lng,p_accuracy,p_measured);
 if controlgps.distance_m(p_lat,p_lng,p.latitude,p.longitude)>p.radius_m then raise exception 'Estás fuera de la zona permitida.';end if;
 insert into controlgps.attendance_sessions(employee_id,project_id,check_in_latitude,check_in_longitude,check_in_accuracy_m) values(auth.uid(),p.id,p_lat,p_lng,p_accuracy) returning * into s;
 insert into controlgps.monitor_state(session_id,last_measurement,last_received) values(s.id,p_measured,now());
 insert into controlgps.location_events(attendance_session_id,employee_id,project_id,event_type,latitude,longitude,accuracy_m,measured_at) values(s.id,auth.uid(),p.id,'inside',p_lat,p_lng,p_accuracy,p_measured);
 return s;end$$;
create function controlgps.check_out(p_lat double precision default null,p_lng double precision default null,p_accuracy double precision default null,p_measured timestamptz default null,p_reason text default null) returns controlgps.attendance_sessions language plpgsql security definer set search_path='' as $$declare s controlgps.attendance_sessions;p controlgps.projects;begin
 if not controlgps.is_active() then raise exception 'Cuenta inactiva o sesión expirada.';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select * into s from controlgps.attendance_sessions where employee_id=auth.uid() and check_out_at is null for update;
 if not found then raise exception 'No tienes una jornada abierta.';end if;
 select * into p from controlgps.projects where id=s.project_id;
 if p_lat is not null or p_lng is not null or p_accuracy is not null then
 perform controlgps.validate_gps(p_lat,p_lng,p_accuracy,p_measured);
 if controlgps.distance_m(p_lat,p_lng,p.latitude,p.longitude)>p.radius_m and length(trim(coalesce(p_reason,'')))<5 then raise exception 'Indica el motivo de salida fuera de zona (mínimo 5 caracteres).';end if;
 elsif length(trim(coalesce(p_reason,'')))<5 then raise exception 'Indica el motivo de salida sin GPS (mínimo 5 caracteres).';end if;
 update controlgps.attendance_sessions set check_out_at=clock_timestamp(),check_out_latitude=p_lat,check_out_longitude=p_lng,check_out_accuracy_m=p_accuracy,check_out_reason=nullif(trim(p_reason),'') where id=s.id returning * into s;return s;end$$;
create function controlgps.record_location(p_session uuid,p_lat double precision default null,p_lng double precision default null,p_accuracy double precision default null,p_measured timestamptz default null,p_signal text default null) returns text language plpgsql security definer set search_path='' as $$declare s controlgps.attendance_sessions;p controlgps.projects;m controlgps.monitor_state;z text;d double precision;begin
 if not controlgps.is_active() then raise exception 'Cuenta inactiva o sesión expirada.';end if;
 select * into s from controlgps.attendance_sessions where id=p_session and employee_id=auth.uid() and check_out_at is null for update;
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
create function controlgps.set_employee_active(p_employee uuid,p_active boolean) returns void language plpgsql security definer set search_path='' as $$begin if not controlgps.is_admin() then raise exception 'Acceso denegado.';end if;update controlgps.profiles set active=p_active where id=p_employee and role='employee';if not found then raise exception 'Empleado no encontrado.';end if;end$$;
create function controlgps.adjust_attendance(p_session uuid,p_in timestamptz,p_out timestamptz,p_reason text) returns void language plpgsql security definer set search_path='' as $$declare old controlgps.attendance_sessions;n controlgps.attendance_sessions;begin
 if not controlgps.is_admin() then raise exception 'Acceso denegado.';end if;
 if length(trim(coalesce(p_reason,'')))<5 then raise exception 'Indica un motivo de al menos 5 caracteres.';end if;
 select * into old from controlgps.attendance_sessions where id=p_session for update;
 if not found then raise exception 'Registro no encontrado.';end if;
 if p_in is null or p_in>now() or p_out>now() or p_out<p_in then raise exception 'Horario inválido.';end if;
 update controlgps.attendance_sessions set check_in_at=p_in,check_out_at=p_out where id=p_session returning * into n;
 insert into controlgps.attendance_adjustments(attendance_session_id,admin_id,reason,previous_values,new_values) values(p_session,auth.uid(),p_reason,to_jsonb(old),to_jsonb(n));end$$;
-- PostgreSQL grants EXECUTE to PUBLIC by default: explicitly revoke it.
create function controlgps.enroll_employee(p_email text,p_name text) returns uuid language plpgsql security definer set search_path='' as $$declare user_id uuid;begin
 if not controlgps.is_admin() then raise exception 'Acceso denegado.';end if;
 if length(trim(coalesce(p_name,'')))<1 or length(p_name)>200 then raise exception 'Nombre inválido.';end if;
 select id into user_id from auth.users where lower(email)=lower(trim(p_email));
 if not found then raise exception 'Ese correo no tiene una cuenta existente. Usa Enviar invitación.';end if;
 insert into controlgps.profiles(id,full_name,email) select id,trim(p_name),email from auth.users where id=user_id on conflict(id) do nothing;
 return user_id;end$$;
revoke execute on function controlgps.enroll_employee(text,text) from public,anon,authenticated;
grant execute on function controlgps.enroll_employee(text,text) to authenticated;
revoke execute on function controlgps.is_active(),controlgps.is_admin(),controlgps.new_profile(),controlgps.touch_project(),controlgps.distance_m(double precision,double precision,double precision,double precision),controlgps.validate_gps(double precision,double precision,double precision,timestamptz),controlgps.check_in(uuid,double precision,double precision,double precision,timestamptz),controlgps.check_out(double precision,double precision,double precision,timestamptz,text),controlgps.record_location(uuid,double precision,double precision,double precision,timestamptz,text),controlgps.set_employee_active(uuid,boolean),controlgps.adjust_attendance(uuid,timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function controlgps.is_active(),controlgps.is_admin(),controlgps.check_in(uuid,double precision,double precision,double precision,timestamptz),controlgps.check_out(double precision,double precision,double precision,timestamptz,text),controlgps.record_location(uuid,double precision,double precision,double precision,timestamptz,text),controlgps.set_employee_active(uuid,boolean),controlgps.adjust_attendance(uuid,timestamptz,timestamptz,text) to authenticated;
commit;
