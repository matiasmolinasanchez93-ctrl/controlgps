import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
const db = new PGlite();
const admin = "10000000-0000-0000-0000-000000000001",
  employee = "20000000-0000-0000-0000-000000000001",
  attacker = "20000000-0000-0000-0000-000000000002",
  other = "20000000-0000-0000-0000-000000000003";
let code: string, id: string, recovery: string, claim: string;
async function asUser(uid: string) {
  await db.exec(
    `reset role;select set_config('request.jwt.claim.sub','${uid}',false);select set_config('request.jwt.claims','{"amr":[{"method":"password","timestamp":${Math.floor(Date.now() / 1000)}}]}',false);set role authenticated;`,
  );
}
async function result<T = Record<string, unknown>>(sql: string) {
  return (await db.query<{ value: T }>(sql)).rows[0].value;
}
beforeAll(async () => {
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb,email_confirmed_at timestamptz);create table auth.sessions(id uuid primary key,user_id uuid,created_at timestamptz default now());create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
  );
  for (const name of [
    "202610130001_controlgps.sql",
    "202610130002_companies.sql",
    "202610130003_private_codes.sql",
  ])
    await db.exec(
      readFileSync(
        new URL("../supabase/migrations/" + name, import.meta.url),
        "utf8",
      ),
    );
  await db.exec(
    `insert into auth.users values('${admin}','admin@example.com','{}',null),('${employee}','alternate@example.com','{}',null),('${attacker}','employee@example.com','{"role":"admin"}',null),('${other}','other@example.com','{}',null);`,
  );
}, 30000);
afterAll(() => db.close());
describe.sequential("Invitaciones y recuperación sin correo", () => {
  it("crea empresa sin confirmación, sin conceder roles mediante metadata", async () => {
    await asUser(admin);
    await db.query(
      "select controlgps.create_company('Empresa segura','Administrador')",
    );
    await asUser(attacker);
    expect(
      (await db.query("select * from controlgps.profiles")).rows,
    ).toHaveLength(0);
    await expect(
      db.query(
        "select controlgps.issue_invitation_code('x@example.com','Intrusión')",
      ),
    ).rejects.toThrow("Acceso");
  });
  it("crea código aleatorio y no permite leer su hash privado", async () => {
    await asUser(admin);
    const r = await result<{ code: string; id: string }>(
      "select controlgps.issue_invitation_code('employee@example.com','Empleado autorizado') as value",
    );
    code = r.code;
    id = r.id;
    expect(code).toMatch(/^CG-[A-F0-9]{32}$/);
    await expect(
      db.query("select * from controlgps.invitation_secrets"),
    ).rejects.toThrow("permission denied");
  });
  it("correo suplantado no basta y las rutas antiguas están cerradas", async () => {
    await asUser(attacker);
    await expect(
      db.query(`select controlgps.accept_invitation('${id}')`),
    ).rejects.toThrow("permission denied");
    await expect(
      db.query("select * from controlgps.my_invitations()"),
    ).rejects.toThrow("permission denied");
    expect(
      (
        await result(
          `select controlgps.accept_invitation_code('CG-00000000000000000000000000000000') as value`,
        )
      ).ok,
    ).toBe(false);
    expect(
      (await db.query("select * from controlgps.projects")).rows,
    ).toHaveLength(0);
  });
  it("poseedor del código entra como empleado aunque use otro correo disponible", async () => {
    await asUser(employee);
    expect(
      (
        await result(
          `select controlgps.accept_invitation_code('${code.toLowerCase()}') as value`,
        )
      ).ok,
    ).toBe(true);
    const r = await db.query<{ role: string; full_name: string }>(
      "select role,full_name from controlgps.profiles",
    );
    expect(r.rows[0]).toEqual({
      role: "employee",
      full_name: "Empleado autorizado",
    });
  });
  it("código de un solo uso no puede reutilizarse", async () => {
    await asUser(other);
    expect(
      (
        await result(
          `select controlgps.accept_invitation_code('${code}') as value`,
        )
      ).ok,
    ).toBe(false);
  });
  it("renovación invalida código anterior y revocación bloquea el nuevo", async () => {
    await asUser(admin);
    const old = await result<{ id: string; code: string }>(
      "select controlgps.issue_invitation_code('other@example.com','Otra persona') as value",
    );
    const next = await result<{ id: string; code: string }>(
      "select controlgps.issue_invitation_code('other@example.com','Otra persona') as value",
    );
    expect(old.code).not.toBe(next.code);
    await asUser(other);
    expect(
      (
        await result(
          `select controlgps.accept_invitation_code('${old.code}') as value`,
        )
      ).ok,
    ).toBe(false);
    await asUser(admin);
    await db.query(`select controlgps.revoke_invitation('${next.id}')`);
    await asUser(other);
    expect(
      (
        await result(
          `select controlgps.accept_invitation_code('${next.code}') as value`,
        )
      ).ok,
    ).toBe(false);
  });
  it("limita intentos persistentes sin rollback de los contadores", async () => {
    await asUser(attacker);
    for (let n = 0; n < 9; n++)
      await result(
        "select controlgps.accept_invitation_code('incorrecto') as value",
      );
    expect(
      (
        await result(
          "select controlgps.accept_invitation_code('incorrecto') as value",
        )
      ).message,
    ).toContain("15 minutos");
  });
  it("clave de recuperación exige autenticación reciente por contraseña", async () => {
    await asUser(employee);
    await db.exec("select set_config('request.jwt.claims','{}',false)");
    await expect(
      db.query("select controlgps.generate_recovery_code()"),
    ).rejects.toThrow("Confirma tu contraseña");
    await asUser(employee);
    recovery = (
      await result<{ code: string }>(
        "select controlgps.generate_recovery_code() as value",
      )
    ).code;
    expect(recovery).toMatch(/^RC-[A-F0-9]{64}$/);
    await expect(
      db.query("select * from controlgps.recovery_secrets"),
    ).rejects.toThrow("permission denied");
    await expect(
      db.query(
        `select controlgps.claim_recovery('alternate@example.com','${recovery}')`,
      ),
    ).rejects.toThrow("permission denied");
  });
  it("solo servicio reclama recuperación y bloquea solicitudes simultáneas", async () => {
    await db.exec("reset role;set role service_role");
    expect(
      await result(
        "select controlgps.claim_recovery('alternate@example.com','incorrecto') as value",
      ),
    ).toBeNull();
    const r = await result<{ user_id: string; claim_id: string }>(
      `select controlgps.claim_recovery('alternate@example.com','${recovery}') as value`,
    );
    expect(r.user_id).toBe(employee);
    claim = r.claim_id;
    expect(
      await result(
        `select controlgps.claim_recovery('alternate@example.com','${recovery}') as value`,
      ),
    ).toBeNull();
  });
  it("fallo de actualización libera reserva sin consumir la clave", async () => {
    await result<boolean>(
      `select controlgps.finish_recovery('${employee}','${claim}',false) as value`,
    );
    const r = await result<{ claim_id: string }>(
      `select controlgps.claim_recovery('alternate@example.com','${recovery}') as value`,
    );
    claim = r.claim_id;
    expect(claim).toBeTruthy();
  });
  it("recuperación consume clave y bloquea sesiones anteriores incluso con JWT renovado", async () => {
    await result<boolean>(
      `select controlgps.finish_recovery('${employee}','${claim}',true) as value`,
    );
    expect(
      await result(
        `select controlgps.claim_recovery('alternate@example.com','${recovery}') as value`,
      ),
    ).toBeNull();
    await db.exec("reset role");
    const old = "30000000-0000-0000-0000-000000000001",
      fresh = "30000000-0000-0000-0000-000000000002";
    await db.exec(
      `insert into auth.sessions values('${old}','${employee}',now()-interval '1 day'),('${fresh}','${employee}',clock_timestamp()+interval '1 second')`,
    );
    await asUser(employee);
    await db.exec(
      `select set_config('request.jwt.claims','{"session_id":"${old}","iat":${Math.floor(Date.now() / 1000) + 10}}',false)`,
    );
    expect(
      await result<boolean>("select controlgps.session_is_valid() as value"),
    ).toBe(false);
    expect(
      (await db.query("select * from controlgps.profiles")).rows,
    ).toHaveLength(0);
    await db.exec(
      `select set_config('request.jwt.claims','{"session_id":"${fresh}"}',false)`,
    );
    expect(
      await result<boolean>("select controlgps.session_is_valid() as value"),
    ).toBe(true);
  });
});
