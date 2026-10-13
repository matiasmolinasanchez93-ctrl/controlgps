import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
const db = new PGlite();
const a = "10000000-0000-0000-0000-000000000001",
  b = "10000000-0000-0000-0000-000000000002",
  employee = "20000000-0000-0000-0000-000000000001",
  outsider = "20000000-0000-0000-0000-000000000002",
  unverified = "20000000-0000-0000-0000-000000000003";
let companyA: string,
  companyB: string,
  projectA: string,
  projectB: string,
  invitation: string,
  attendance: string;
const asUser = async (id: string) => {
  await db.exec(
    `reset role;select set_config('request.jwt.claim.sub','${id}',false);set role authenticated;`,
  );
};
const scalar = async (sql: string) =>
  (await db.query<{ id: string }>(sql)).rows[0].id;
beforeAll(async () => {
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
  );
  for (const name of [
    "202610130001_controlgps.sql",
    "202610130002_companies.sql",
  ])
    await db.exec(
      readFileSync(
        new URL("../supabase/migrations/" + name, import.meta.url),
        "utf8",
      ),
    );
  await db.exec(
    `insert into auth.users values('${a}','a@example.com','{"role":"admin"}',now()),('${b}','b@example.com','{}',now()),('${employee}','employee@example.com','{"role":"admin","controlgps_enrolled":true}',now()),('${outsider}','outsider@example.com','{}',now()),('${unverified}','pending@example.com','{}',null)`,
  );
}, 30000);
afterAll(() => db.close());
describe.sequential("Empresas, registro y aislamiento", () => {
  it("metadatos no crean administrador ni membresía", async () => {
    expect(
      (await db.query("select * from controlgps.profiles")).rows,
    ).toHaveLength(0);
  });
  it("registro requiere sesión y correo confirmado", async () => {
    await db.exec("set role anon");
    await expect(
      db.query("select controlgps.create_company('Empresa ajena','Usuario')"),
    ).rejects.toThrow("permission denied");
    await asUser(unverified);
    await expect(
      db.query("select controlgps.create_company('Empresa','Pendiente')"),
    ).rejects.toThrow("Confirma");
  });
  it("dos usuarios crean empresas separadas de forma atómica", async () => {
    await asUser(a);
    companyA = await scalar(
      "select controlgps.create_company('Empresa A','Admin A') as id",
    );
    await expect(
      db.query("select controlgps.create_company('Otra empresa','Admin')"),
    ).rejects.toThrow("ya pertenece");
    await asUser(b);
    companyB = await scalar(
      "select controlgps.create_company('Empresa B','Admin B') as id",
    );
    expect(companyA).not.toBe(companyB);
    expect(
      (await db.query("select * from controlgps.companies")).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("select * from controlgps.profiles")).rows,
    ).toHaveLength(1);
  });
  it("proyectos y configuración no cruzan empresas", async () => {
    await asUser(a);
    projectA = await scalar(
      `insert into controlgps.projects(name,latitude,longitude) values('Obra A',0,0) returning id`,
    );
    await asUser(b);
    projectB = await scalar(
      `insert into controlgps.projects(name,latitude,longitude) values('Obra B',0,0) returning id`,
    );
    expect(
      (await db.query("select * from controlgps.projects")).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          `update controlgps.projects set name='Intrusión' where id='${projectA}' returning id`,
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          `update controlgps.companies set name='Intrusión' where id='${companyA}' returning id`,
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      db.exec(
        `update controlgps.companies set owner_id='${a}' where id='${companyB}'`,
      ),
    ).rejects.toThrow("permission denied");
    await expect(
      db.exec(
        `insert into controlgps.projects(name,latitude,longitude,company_id) values('Intrusión',0,0,'${companyA}')`,
      ),
    ).rejects.toThrow("row-level security");
  });
  it("invitación privada no concede acceso automáticamente", async () => {
    await asUser(a);
    invitation = await scalar(
      "select controlgps.prepare_invitation('employee@example.com','Empleado A') as id",
    );
    await asUser(outsider);
    expect(
      (await db.query("select * from controlgps.company_invitations")).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select * from controlgps.my_invitations()")).rows,
    ).toHaveLength(0);
    await expect(
      db.query(`select controlgps.accept_invitation('${invitation}')`),
    ).rejects.toThrow("otro correo");
    await asUser(employee);
    expect(
      (await db.query("select * from controlgps.my_invitations()")).rows,
    ).toHaveLength(1);
    await db.query(`select controlgps.accept_invitation('${invitation}')`);
    const r = await db.query<{ role: string; company_id: string }>(
      "select role,company_id from controlgps.profiles",
    );
    expect(r.rows[0]).toEqual({ role: "employee", company_id: companyA });
    await expect(
      db.query("select controlgps.create_company('Escape','Usuario')"),
    ).rejects.toThrow("ya pertenece");
  });
  it("administrador ajeno no activa empleado ni obtiene su perfil", async () => {
    await asUser(b);
    expect(
      (
        await db.query(
          `select * from controlgps.profiles where id='${employee}'`,
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      db.query(`select controlgps.set_employee_active('${employee}',false)`),
    ).rejects.toThrow("tu empresa");
    await expect(
      db.query(
        "select controlgps.prepare_invitation('employee@example.com','Capturar empleado')",
      ),
    ).rejects.toThrow("ya pertenece");
  });
  it("asignaciones usan llaves compuestas y rechazan cruce", async () => {
    await asUser(b);
    await expect(
      db.exec(
        `insert into controlgps.project_assignments(project_id,employee_id) values('${projectB}','${employee}')`,
      ),
    ).rejects.toThrow("foreign key");
    await asUser(a);
    await db.exec(
      `insert into controlgps.project_assignments(project_id,employee_id) values('${projectA}','${employee}')`,
    );
    await asUser(employee);
    await expect(
      db.query(`select controlgps.check_in('${projectB}',0,0,10,now())`),
    ).rejects.toThrow("proyecto");
    attendance = await scalar(
      `select (controlgps.check_in('${projectA}',0,0,10,now())).id as id`,
    );
  });
  it("jornada GPS, eventos y ajustes aislados", async () => {
    await asUser(b);
    expect(
      (await db.query("select * from controlgps.attendance_sessions")).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select * from controlgps.location_events")).rows,
    ).toHaveLength(0);
    await expect(
      db.query(
        `select controlgps.adjust_attendance('${attendance}',now(),null,'Intento ajeno')`,
      ),
    ).rejects.toThrow("Registro no encontrado");
    await expect(
      db.query(
        `select controlgps.record_location('${attendance}',0,0,10,now())`,
      ),
    ).rejects.toThrow("jornada abierta");
    await asUser(employee);
    await db.query(
      "select controlgps.check_out(.01,0,10,now(),'Salida fuera de obra')",
    );
    await asUser(a);
    await db.query(
      `select controlgps.adjust_attendance('${attendance}',now()-interval '1 hour',now(),'Corrección propia')`,
    );
    expect(
      (await db.query("select * from controlgps.attendance_adjustments")).rows,
    ).toHaveLength(1);
    await asUser(b);
    expect(
      (await db.query("select * from controlgps.attendance_adjustments")).rows,
    ).toHaveLength(0);
  });
  it("invitación expirada y revocada no concede acceso", async () => {
    await asUser(a);
    const id = await scalar(
      "select controlgps.prepare_invitation('outsider@example.com','Invitado') as id",
    );
    await db.query(`select controlgps.revoke_invitation('${id}')`);
    await asUser(outsider);
    await expect(
      db.query(`select controlgps.accept_invitation('${id}')`),
    ).rejects.toThrow("no es válida");
    await asUser(a);
    await db.query(
      "select controlgps.prepare_invitation('outsider@example.com','Invitado')",
    );
    await db.exec("reset role");
    await db.exec(
      `update controlgps.company_invitations set expires_at=now()-interval '1 day' where id='${id}'`,
    );
    await asUser(outsider);
    await expect(
      db.query(`select controlgps.accept_invitation('${id}')`),
    ).rejects.toThrow("expiró");
  });
  it("desactivación impide crear otra empresa para eludir controles", async () => {
    await asUser(a);
    await db.query(
      `select controlgps.set_employee_active('${employee}',false)`,
    );
    await asUser(employee);
    expect(
      (await db.query("select * from controlgps.projects")).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select controlgps.create_company('Eludir','Usuario')"),
    ).rejects.toThrow("ya pertenece");
  });
});
