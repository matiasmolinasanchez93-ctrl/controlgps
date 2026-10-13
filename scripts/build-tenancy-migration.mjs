import { readFileSync, writeFileSync } from "node:fs";
const initial = readFileSync(
  new URL(
    "../supabase/migrations/202610130001_controlgps.sql",
    import.meta.url,
  ),
  "utf8",
);
const target = new URL(
  "../supabase/migrations/202610130002_companies.sql",
  import.meta.url,
);
const marker =
  "-- Existing attendance RPC implementations are replaced below with explicit company scope.";
const head = readFileSync(target, "utf8").split(marker)[0] + marker + "\n";
const functions = [
  ...initial.matchAll(
    /create function controlgps\.(check_in|check_out|record_location|adjust_attendance)\([\s\S]*?end\$\$;/g,
  ),
].map((match) =>
  match[0]
    .replace("create function", "create or replace function")
    .replace(
      "where id=p_project for share",
      "where id=p_project and company_id=controlgps.current_company() for share",
    )
    .replace(
      "where employee_id=auth.uid() and check_out_at is null",
      "where employee_id=auth.uid() and company_id=controlgps.current_company() and check_out_at is null",
    )
    .replace(
      "where id=p_session and employee_id=auth.uid()",
      "where id=p_session and company_id=controlgps.current_company() and employee_id=auth.uid()",
    )
    .replace(
      "where id=p_session for update",
      "where id=p_session and company_id=controlgps.current_company() for update",
    ),
);
if (functions.length !== 4)
  throw Error("No se encontraron todas las funciones de asistencia.");
writeFileSync(target, head + functions.join("\n") + "\ncommit;\n");
