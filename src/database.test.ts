import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
const db = new PGlite();
const admin = "10000000-0000-0000-0000-000000000001",
  emp = "20000000-0000-0000-0000-000000000001",
  other = "20000000-0000-0000-0000-000000000002",
  project = "30000000-0000-0000-0000-000000000001";
async function asUser(id: string) {
  await db.exec(
    `reset role;select set_config('request.jwt.claim.sub','${id}',false);set role authenticated;`,
  );
}
const checkIn = () =>
  db.query(`select (controlgps.check_in('${project}',0,0,10,now())).id as id`);
beforeAll(async () => {
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
  );
  await db.exec(
    `create table public.profiles(id uuid primary key,name text);create function public.handle_new_user() returns trigger language plpgsql as $$begin insert into public.profiles values(new.id,'Nombre de Business Helper');return new;end$$;create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();`,
  );
  await db.exec(
    readFileSync(
      new URL(
        "../supabase/migrations/202610130001_controlgps.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    `insert into auth.users values('${admin}','admin@example.com','{"full_name":"Admin","role":"admin","controlgps_enrolled":true}'),('${emp}','empleado@example.com','{"controlgps_enrolled":true}'),('${other}','otro@example.com','{"controlgps_enrolled":true}');update controlgps.profiles set role='admin' where id='${admin}';insert into controlgps.projects(id,name,latitude,longitude,created_by) values('${project}','Obra',0,0,'${admin}');insert into controlgps.project_assignments(project_id,employee_id) values('${project}','${emp}');`,
  );
  await db.exec(
    "alter table auth.users add column email_confirmed_at timestamptz default now();",
  );
  await db.exec(
    readFileSync(
      new URL(
        "../supabase/migrations/202610130002_companies.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
}, 30000);
afterAll(() => db.close());
describe.sequential("Backend real PostgreSQL embebido", () => {
  it("convive con perfiles y trigger existentes sin reemplazarlos", async () => {
    const r = await db.query<{ name: string }>(
      "select name from public.profiles",
    );
    expect(r.rows).toHaveLength(3);
    expect(
      r.rows.every((row) => row.name === "Nombre de Business Helper"),
    ).toBe(true);
    await db.exec(
      `insert into auth.users(id,email,raw_user_meta_data) values('90000000-0000-0000-0000-000000000001','existente@example.com','{}')`,
    );
    expect(
      (
        await db.query(
          "select * from controlgps.profiles where email='existente@example.com'",
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          "select * from public.profiles where id='90000000-0000-0000-0000-000000000001'",
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("agrega cuenta existente sin modificar la otra app y exige administrador", async () => {
    await asUser(emp);
    await expect(
      db.query(
        "select controlgps.enroll_employee('existente@example.com','Empleado existente')",
      ),
    ).rejects.toThrow("Acceso");
    await asUser(admin);
    const invitation = await db.query<{ id: string }>(
      "select controlgps.enroll_employee('existente@example.com','Empleado existente') as id",
    );
    await asUser("90000000-0000-0000-0000-000000000001");
    await db.query(
      `select controlgps.accept_invitation('${invitation.rows[0].id}')`,
    );
    await asUser(admin);
    const r = await db.query<{ role: string }>(
      "select role from controlgps.profiles where email='existente@example.com'",
    );
    expect(r.rows[0].role).toBe("employee");
    await db.query(
      "select controlgps.enroll_employee('noexiste@example.com','Empleado')",
    );
    expect(
      (
        await db.query(
          "select * from controlgps.profiles where email='noexiste@example.com'",
        )
      ).rows,
    ).toHaveLength(0);
    await db.exec("reset role");
    expect(
      (
        await db.query<{ name: string }>(
          "select name from public.profiles where id='90000000-0000-0000-0000-000000000001'",
        )
      ).rows[0].name,
    ).toBe("Nombre de Business Helper");
  });
  it("no eleva rol por metadatos", async () => {
    const r = await db.query<{ role: string }>(
      `select role from controlgps.profiles where id='${emp}'`,
    );
    expect(r.rows[0].role).toBe("employee");
  });
  it("rechaza sin asignación y a anónimo", async () => {
    await asUser(other);
    await expect(checkIn()).rejects.toThrow("asignado");
    await db.exec("reset role;set role anon;");
    await expect(checkIn()).rejects.toThrow("permission denied");
  });
  it("RLS limita empleados y bloquea escrituras directas", async () => {
    await asUser(emp);
    const r = await db.query("select * from controlgps.profiles");
    expect(r.rows).toHaveLength(1);
    await expect(
      db.exec(`update controlgps.profiles set role='admin'`),
    ).rejects.toThrow("permission denied");
    await expect(
      db.exec(
        `insert into controlgps.attendance_sessions(employee_id,project_id) values('${emp}','${project}')`,
      ),
    ).rejects.toThrow("permission denied");
    const visible = await db.query("select * from controlgps.projects");
    expect(visible.rows).toHaveLength(1);
    await asUser(other);
    expect(
      (await db.query("select * from controlgps.projects")).rows,
    ).toHaveLength(0);
  });
  it("valida radio, GPS malo y fuera de zona", async () => {
    await asUser(admin);
    await expect(
      db.exec(
        `update controlgps.projects set radius_m=0 where id='${project}'`,
      ),
    ).rejects.toThrow();
    await asUser(emp);
    await expect(
      db.query(`select controlgps.check_in('${project}',0,0,51,now())`),
    ).rejects.toThrow("Precisión");
    await expect(
      db.query(`select controlgps.check_in('${project}',0.01,0,10,now())`),
    ).rejects.toThrow("fuera");
  });
  it("entrada oficial y duplicado", async () => {
    await asUser(emp);
    const r = await checkIn();
    expect(r.rows).toHaveLength(1);
    await expect(checkIn()).rejects.toThrow("jornada abierta");
  });
  it("monitoreo exige dos muestras, no cierra jornada y vuelve dentro", async () => {
    await asUser(emp);
    const r = await db.query<{ id: string }>(
      "select id from controlgps.attendance_sessions where check_out_at is null",
    );
    const id = r.rows[0].id;
    // distinct measurement times within accepted clock window
    const send = (lat: number, offset: number) =>
      db.query<{ zone: string }>(
        `select controlgps.record_location('${id}',${lat},0,10,now()+interval '${offset} milliseconds') as zone`,
      );
    expect((await send(0.002, 100)).rows[0].zone).toBe("inside");
    expect((await send(0.002, 200)).rows[0].zone).toBe("outside");
    expect(
      (
        await db.query(
          "select * from controlgps.attendance_sessions where check_out_at is null",
        )
      ).rows,
    ).toHaveLength(1);
    expect((await send(0, 300)).rows[0].zone).toBe("inside");
  });
  it("indisponibilidad rompe lecturas consecutivas incluso con señal deduplicada", async () => {
    await asUser(emp);
    const r = await db.query<{ id: string }>(
      "select id from controlgps.attendance_sessions where check_out_at is null",
    );
    const id = r.rows[0].id;
    const send = (lat: number, ms: number) =>
      db.query<{ zone: string }>(
        `select controlgps.record_location('${id}',${lat},0,10,now()+interval '${ms} milliseconds') as zone`,
      );
    expect((await send(0.002, 1000)).rows[0].zone).toBe("inside");
    await db.query(
      `select controlgps.record_location('${id}',p_signal=>'gps_unavailable')`,
    );
    expect((await send(0.002, 1100)).rows[0].zone).toBe("inside");
    await db.query(
      `select controlgps.record_location('${id}',p_signal=>'gps_unavailable')`,
    );
    expect((await send(0.002, 1200)).rows[0].zone).toBe("inside");
    expect((await send(0.002, 1300)).rows[0].zone).toBe("outside");
    expect((await send(0, 1400)).rows[0].zone).toBe("inside");
  });
  it("salida fuera del radio requiere motivo, no exige estar dentro", async () => {
    await asUser(emp);
    await expect(
      db.query(`select controlgps.check_out(.01,0,10,now(),'')`),
    ).rejects.toThrow("motivo");
    await db.query(
      `select controlgps.check_out(.01,0,10,now(),'Fin de jornada fuera de obra')`,
    );
    await expect(db.query("select controlgps.check_out()")).rejects.toThrow(
      "No tienes",
    );
  });
  it("ajuste auditado restringido a admin", async () => {
    await asUser(emp);
    const r = await db.query<{ id: string }>(
      "select id from controlgps.attendance_sessions limit 1",
    );
    const id = r.rows[0].id;
    await expect(
      db.query(
        `select controlgps.adjust_attendance('${id}',now()-interval '1 hour',now(),'Corrección autorizada')`,
      ),
    ).rejects.toThrow("Acceso");
    await asUser(admin);
    await db.query(
      `select controlgps.adjust_attendance('${id}',now()-interval '1 hour',now(),'Corrección autorizada')`,
    );
    expect(
      (await db.query("select * from controlgps.attendance_adjustments")).rows,
    ).toHaveLength(1);
  });
  it("cuenta desactivada pierde acceso y proyecto archivado rechaza entrada", async () => {
    await asUser(admin);
    await db.query(`select controlgps.set_employee_active('${emp}',false)`);
    await asUser(emp);
    await expect(checkIn()).rejects.toThrow("inactiva");
    expect(
      (await db.query("select * from controlgps.attendance_sessions")).rows,
    ).toHaveLength(0);
    await asUser(admin);
    await db.query(`select controlgps.set_employee_active('${emp}',true)`);
    await db.exec(
      `update controlgps.projects set active=false where id='${project}'`,
    );
    await asUser(emp);
    await expect(checkIn()).rejects.toThrow("archivado");
  });
});
