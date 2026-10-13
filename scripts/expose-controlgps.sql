-- Run as database owner after the initial migration. Preserve an existing role override.
-- When no override exists, this shared project uses the standard public/GraphQL API schemas.
do $$declare schemas text;begin
 select substr(setting,length('pgrst.db_schemas=')+1) into schemas
 from pg_roles r cross join lateral unnest(r.rolconfig) setting
 where r.rolname='authenticator' and setting like 'pgrst.db_schemas=%';
 schemas=coalesce(schemas,'public,graphql_public');
 if not 'controlgps'=any(string_to_array(replace(schemas,' ',''),',')) then
 execute format('alter role authenticator set pgrst.db_schemas = %L',schemas||',controlgps');
 end if;
end$$;
notify pgrst,'reload config';
notify pgrst,'reload schema';
