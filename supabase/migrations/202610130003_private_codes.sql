begin;
create table controlgps.invitation_secrets(invitation_id uuid primary key references controlgps.company_invitations(id),code_hash text not null unique,created_at timestamptz not null default now());
create table controlgps.recovery_secrets(user_id uuid primary key references auth.users(id),code_hash text not null unique,created_at timestamptz not null default now(),used_at timestamptz,claim_id uuid,claim_until timestamptz,sessions_valid_after timestamptz);
create table controlgps.access_attempts(actor text primary key,window_at timestamptz not null default now(),attempts integer not null default 0);
alter table controlgps.invitation_secrets enable row level security;
alter table controlgps.recovery_secrets enable row level security;
alter table controlgps.access_attempts enable row level security;
revoke all on controlgps.invitation_secrets,controlgps.recovery_secrets,controlgps.access_attempts from public,anon,authenticated,service_role;
create function controlgps.code_hash(p_code text) returns text language sql immutable set search_path='' as $$select encode(sha256(convert_to(regexp_replace(upper(trim(p_code)),'[[:space:]-]','','g'),'UTF8')),'hex')$$;
create function controlgps.session_is_valid() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from auth.users where id=auth.uid() and email is not null)
 and not exists(select 1 from controlgps.recovery_secrets r where r.user_id=auth.uid() and r.sessions_valid_after is not null and coalesce((select s.created_at from auth.sessions s where s.id=nullif(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id','')::uuid and s.user_id=auth.uid()),'-infinity'::timestamptz)<r.sessions_valid_after)
$$;
create or replace function controlgps.current_company() returns uuid language sql stable security definer set search_path='' as $$select p.company_id from controlgps.profiles p join controlgps.companies c on c.id=p.company_id where p.id=auth.uid() and p.active and c.active and controlgps.session_is_valid()$$;
-- Compatibility helper used by create_company; confirmation is intentionally not required.
create or replace function controlgps.require_verified_user() returns void language plpgsql security definer set search_path='' as $$begin if not controlgps.session_is_valid() then raise exception 'Sesión inválida o revocada. Inicia sesión de nuevo.';end if;end$$;
drop policy profile_read on controlgps.profiles;
create policy profile_read on controlgps.profiles for select to authenticated using(controlgps.session_is_valid() and (id=auth.uid() or (company_id=controlgps.current_company() and controlgps.is_admin())));
create function controlgps.allow_attempt(p_actor text) returns boolean language plpgsql security definer set search_path='' as $$declare n integer;begin
 insert into controlgps.access_attempts(actor,attempts) values(p_actor,1) on conflict(actor) do update set attempts=case when access_attempts.window_at<now()-interval '15 minutes' then 1 else access_attempts.attempts+1 end,window_at=case when access_attempts.window_at<now()-interval '15 minutes' then now() else access_attempts.window_at end returning attempts into n;
 return n<=8;
end$$;
-- Retire all pending email-only invitations and their old RPC paths.
update controlgps.company_invitations set revoked_at=now() where accepted_at is null and revoked_at is null;
create or replace function controlgps.prepare_invitation(p_email text,p_name text) returns uuid language plpgsql security definer set search_path='' as $$begin raise exception 'Genera una invitación con código privado.';end$$;
create or replace function controlgps.enroll_employee(p_email text,p_name text) returns uuid language plpgsql security definer set search_path='' as $$begin raise exception 'Genera una invitación con código privado.';end$$;
create or replace function controlgps.my_invitations() returns table(id uuid,company_name text,full_name text,expires_at timestamptz) language plpgsql security definer set search_path='' as $$begin return;end$$;
create or replace function controlgps.accept_invitation(p_invitation uuid) returns uuid language plpgsql security definer set search_path='' as $$begin raise exception 'Debes ingresar el código privado de la invitación.';end$$;
create function controlgps.issue_invitation_code(p_email text,p_name text) returns jsonb language plpgsql security definer set search_path='' as $$declare i controlgps.company_invitations;code text;begin
 if not controlgps.is_admin() then raise exception 'Acceso denegado.';end if;
 if length(trim(coalesce(p_name,''))) not between 1 and 200 or length(coalesce(p_email,''))>254 or trim(coalesce(p_email,'')) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Nombre y correo de referencia válidos requeridos.';end if;
 if exists(select 1 from controlgps.company_invitations where company_id=controlgps.current_company() and email=lower(trim(p_email)) and accepted_at is not null) then raise exception 'Esta invitación ya fue utilizada. El empleado está en el directorio.';end if;
 insert into controlgps.company_invitations(company_id,email,full_name,invited_by) values(controlgps.current_company(),lower(trim(p_email)),trim(p_name),auth.uid()) on conflict(company_id,email) do update set full_name=excluded.full_name,invited_by=excluded.invited_by,expires_at=now()+interval '7 days',accepted_at=null,revoked_at=null returning * into i;
 code='CG-'||upper(replace(gen_random_uuid()::text,'-',''));
 insert into controlgps.invitation_secrets(invitation_id,code_hash) values(i.id,controlgps.code_hash(code)) on conflict(invitation_id) do update set code_hash=excluded.code_hash,created_at=now();
 return jsonb_build_object('id',i.id,'code',code,'full_name',i.full_name,'expires_at',i.expires_at);
end$$;
create function controlgps.accept_invitation_code(p_code text) returns jsonb language plpgsql security definer set search_path='' as $$declare i controlgps.company_invitations;begin
 perform controlgps.require_verified_user();
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if not controlgps.allow_attempt('invite:'||auth.uid()::text) then return jsonb_build_object('ok',false,'message','Demasiados intentos. Espera 15 minutos.');end if;
 if exists(select 1 from controlgps.profiles where id=auth.uid()) then return jsonb_build_object('ok',false,'message','Tu cuenta ya pertenece a una empresa.');end if;
 if p_code is null or length(p_code)>100 or regexp_replace(upper(trim(p_code)),'[[:space:]-]','','g') !~ '^CG[0-9A-F]{32}$' then return jsonb_build_object('ok',false,'message','Código inválido, utilizado, revocado o vencido.');end if;
 select inv.* into i from controlgps.invitation_secrets s join controlgps.company_invitations inv on inv.id=s.invitation_id join controlgps.companies c on c.id=inv.company_id and c.active where s.code_hash=controlgps.code_hash(p_code) and inv.accepted_at is null and inv.revoked_at is null and inv.expires_at>now() for update of inv;
 if not found then return jsonb_build_object('ok',false,'message','Código inválido, utilizado, revocado o vencido.');end if;
 insert into controlgps.profiles(id,company_id,full_name,email,role) select id,i.company_id,i.full_name,email,'employee' from auth.users where id=auth.uid();
 update controlgps.company_invitations set accepted_at=now() where id=i.id;
 delete from controlgps.invitation_secrets where invitation_id=i.id;
 return jsonb_build_object('ok',true,'company_id',i.company_id);
end$$;
create function controlgps.generate_recovery_code() returns jsonb language plpgsql security definer set search_path='' as $$declare code text;claims jsonb;begin
 perform controlgps.require_verified_user();
 claims=nullif(current_setting('request.jwt.claims',true),'')::jsonb;
 if not exists(select 1 from jsonb_array_elements(coalesce(claims->'amr','[]'::jsonb)) x where x->>'method'='password' and to_timestamp((x->>'timestamp')::double precision)>now()-interval '5 minutes') then raise exception 'Confirma tu contraseña para generar una clave de recuperación.';end if;
 code='RC-'||upper(replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''));
 insert into controlgps.recovery_secrets(user_id,code_hash) values(auth.uid(),controlgps.code_hash(code)) on conflict(user_id) do update set code_hash=excluded.code_hash,created_at=now(),used_at=null,claim_id=null,claim_until=null;
 return jsonb_build_object('code',code);
end$$;
create function controlgps.recovery_status() returns jsonb language plpgsql security definer set search_path='' as $$begin perform controlgps.require_verified_user();return (select jsonb_build_object('configured',exists(select 1 from controlgps.recovery_secrets where user_id=auth.uid() and used_at is null)));end$$;
-- Only the protected recovery Edge function (service_role) can reserve/finalize recovery.
create function controlgps.claim_recovery(p_email text,p_code text) returns jsonb language plpgsql security definer set search_path='' as $$declare r controlgps.recovery_secrets;claim uuid;begin
 if length(coalesce(p_email,''))>254 or length(coalesce(p_code,''))>120 then return null;end if;
 if not controlgps.allow_attempt('recovery:'||encode(sha256(convert_to(lower(trim(coalesce(p_email,''))),'UTF8')),'hex')) then return jsonb_build_object('limited',true);end if;
 select s.* into r from controlgps.recovery_secrets s join auth.users u on u.id=s.user_id where lower(u.email)=lower(trim(p_email)) and s.code_hash=controlgps.code_hash(p_code) and s.used_at is null and (s.claim_until is null or s.claim_until<now()) for update of s;
 if not found then return null;end if;
 claim=gen_random_uuid();
 update controlgps.recovery_secrets set claim_id=claim,claim_until=now()+interval '2 minutes' where user_id=r.user_id;
 return jsonb_build_object('user_id',r.user_id,'claim_id',claim);
end$$;
create function controlgps.finish_recovery(p_user uuid,p_claim uuid,p_success boolean) returns boolean language plpgsql security definer set search_path='' as $$begin
 if p_success then
 update controlgps.recovery_secrets set used_at=now(),claim_id=null,claim_until=null,sessions_valid_after=clock_timestamp() where user_id=p_user and claim_id=p_claim and used_at is null;
 else update controlgps.recovery_secrets set claim_id=null,claim_until=null where user_id=p_user and claim_id=p_claim and used_at is null;end if;
 return found;
end$$;
revoke execute on function controlgps.prepare_invitation(text,text),controlgps.enroll_employee(text,text),controlgps.my_invitations(),controlgps.accept_invitation(uuid),controlgps.code_hash(text),controlgps.allow_attempt(text),controlgps.session_is_valid(),controlgps.issue_invitation_code(text,text),controlgps.accept_invitation_code(text),controlgps.generate_recovery_code(),controlgps.recovery_status(),controlgps.claim_recovery(text,text),controlgps.finish_recovery(uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function controlgps.session_is_valid(),controlgps.issue_invitation_code(text,text),controlgps.accept_invitation_code(text),controlgps.generate_recovery_code(),controlgps.recovery_status() to authenticated;
grant execute on function controlgps.claim_recovery(text,text),controlgps.finish_recovery(uuid,uuid,boolean) to service_role;
commit;
