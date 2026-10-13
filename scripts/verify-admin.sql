begin;
select set_config('request.jwt.claim.sub','db3abfc6-006f-4324-a45f-2fc8ec974ccf',true);
set local role authenticated;
do $$begin
 if not controlgps.is_admin() then raise exception 'El administrador no tiene acceso';end if;
 if (select count(*) from controlgps.profiles where id=auth.uid())<>1 then raise exception 'Perfil no visible';end if;
 perform 1 from controlgps.projects;
 perform 1 from controlgps.attendance_sessions;
end$$;
rollback;
