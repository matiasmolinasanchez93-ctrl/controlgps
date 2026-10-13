import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
export const uid = "10000000-0000-0000-0000-000000000001";
export type TestGPS = {
  latitude: number;
  longitude: number;
  accuracy: number;
  failure?: number;
};
export async function harness(
  page: Page,
  role: "employee" | "admin" | "new" = "employee",
) {
  const db = new PGlite();
  let offline = false;
  let projectId = "";
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
  );
  await db.exec(
    "create table auth.sessions(id uuid primary key,user_id uuid,created_at timestamptz default now());",
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
    `insert into auth.users values('${uid}','prueba@example.com','{"full_name":"Usuario de prueba"}',now());select set_config('request.jwt.claim.sub','${uid}',false);`,
  );
  if (role !== "new") {
    await db.query(
      "select controlgps.create_company('Empresa de prueba','Usuario de prueba')",
    );
    const r = await db.query<{ id: string }>(
      "insert into controlgps.projects(name,latitude,longitude) values('Proyecto de prueba',0,0) returning id",
    );
    projectId = r.rows[0].id;
    if (role === "employee")
      await db.exec(
        `insert into controlgps.project_assignments(project_id,employee_id) values('${projectId}','${uid}');update controlgps.profiles set role='employee' where id='${uid}'`,
      );
  }
  await db.exec("set role authenticated");
  await db.exec(
    `select set_config('request.jwt.claims','{"amr":[{"method":"password","timestamp":${Math.floor(Date.now() / 1000)}}]}',false)`,
  );
  const user = {
    id: uid,
    aud: "authenticated",
    role: "authenticated",
    email: "prueba@example.com",
    email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { full_name: "Usuario de prueba" },
    created_at: new Date().toISOString(),
  };
  const encoded = (v: unknown) =>
    Buffer.from(JSON.stringify(v)).toString("base64url");
  const token = [
    encoded({ alg: "HS256", typ: "JWT" }),
    encoded({
      sub: uid,
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      role: "authenticated",
    }),
    "test-signature",
  ].join(".");
  const auth = {
    access_token: token,
    token_type: "bearer",
    expires_in: 3600,
    refresh_token: "test-refresh-token",
    user,
  };
  await page.addInitScript(() => {
    const state = {
      gps: { latitude: 0, longitude: 0, accuracy: 10, failure: 0 },
      calls: 0,
      options: [] as PositionOptions[],
      watchers: new Map<
        number,
        { ok: PositionCallback; bad?: PositionErrorCallback | null }
      >(),
      next: 1,
    };
    const position = () =>
      ({
        coords: {
          ...state.gps,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
        toJSON: () => ({}),
      }) as GeolocationPosition;
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition: (
          ok: PositionCallback,
          bad?: PositionErrorCallback | null,
          options?: PositionOptions,
        ) => {
          state.calls++;
          state.options.push(options || {});
          setTimeout(() => {
            if (state.gps.failure)
              bad?.({
                code: state.gps.failure,
                message: "GPS de prueba",
              } as GeolocationPositionError);
            else ok(position());
          }, 0);
        },
        watchPosition: (
          ok: PositionCallback,
          bad?: PositionErrorCallback | null,
        ) => {
          const id = state.next++;
          state.watchers.set(id, { ok, bad });
          setTimeout(() => ok(position()), 0);
          return id;
        },
        clearWatch: (id: number) => state.watchers.delete(id),
      },
    });
    Object.assign(window, {
      testGPS: state,
      emitGPS: (gps: typeof state.gps) => {
        state.gps = { ...state.gps, ...gps };
        state.watchers.forEach((w) => {
          if (state.gps.failure)
            w.bad?.({
              code: state.gps.failure,
              message: "GPS de prueba",
            } as GeolocationPositionError);
          else w.ok(position());
        });
      },
    });
  });
  await page.route("https://*.tile.openstreetmap.org/**", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  await page.route("https://controlgps-tests.supabase.co/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const reply = (value: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(value),
      });
    if (url.pathname.includes("/auth/v1/")) {
      if (url.pathname.endsWith("/user")) return reply(user);
      if (url.pathname.endsWith("/signup")) return reply(auth);
      if (url.pathname.endsWith("/logout")) return reply({});
      return reply(auth);
    }
    const table = url.pathname.split("/").pop()!;
    const args = request.method() === "POST" ? request.postDataJSON() : {};
    if (url.pathname.includes("/rpc/")) {
      if (offline && table === "check_in")
        return route.abort("internetdisconnected");
      try {
        let result: unknown;
        if (
          [
            "session_is_valid",
            "generate_recovery_code",
            "recovery_status",
          ].includes(table)
        )
          result = (
            await db.query<{ value: unknown }>(
              `select controlgps.${table}() as value`,
            )
          ).rows[0].value;
        else if (table === "accept_invitation_code")
          result = (
            await db.query<{ value: unknown }>(
              "select controlgps.accept_invitation_code($1) as value",
              [args.p_code],
            )
          ).rows[0].value;
        else if (table === "check_in")
          result = (
            await db.query<{ value: unknown }>(
              "select to_jsonb(controlgps.check_in($1,$2,$3,$4,$5)) as value",
              [
                args.p_project,
                args.p_lat,
                args.p_lng,
                args.p_accuracy,
                args.p_measured,
              ],
            )
          ).rows[0].value;
        else if (table === "check_out")
          result = (
            await db.query<{ value: unknown }>(
              "select to_jsonb(controlgps.check_out($1,$2,$3,$4,$5)) as value",
              [
                args.p_lat,
                args.p_lng,
                args.p_accuracy,
                args.p_measured,
                args.p_reason,
              ],
            )
          ).rows[0].value;
        else if (table === "record_location")
          result = (
            await db.query<{ value: unknown }>(
              "select controlgps.record_location($1,$2,$3,$4,$5,$6) as value",
              [
                args.p_session,
                args.p_lat ?? null,
                args.p_lng ?? null,
                args.p_accuracy ?? null,
                args.p_measured ?? null,
                args.p_signal ?? null,
              ],
            )
          ).rows[0].value;
        else if (table === "create_company")
          result = (
            await db.query<{ value: unknown }>(
              "select controlgps.create_company($1,$2) as value",
              [args.p_name, args.p_full_name],
            )
          ).rows[0].value;
        else if (table === "my_invitations")
          result = (await db.query("select * from controlgps.my_invitations()"))
            .rows;
        else
          throw Error(
            "RPC no implementada en el adaptador de pruebas: " + table,
          );
        return reply(result);
      } catch (error) {
        return reply({ message: (error as Error).message, code: "P0001" }, 400);
      }
    }
    if (
      ![
        "profiles",
        "projects",
        "project_assignments",
        "attendance_sessions",
        "location_events",
        "companies",
        "company_invitations",
      ].includes(table)
    )
      return reply({ message: "Tabla no permitida en prueba" }, 400);
    try {
      let rows: unknown[];
      if (request.method() === "POST") {
        const fields = Object.keys(args);
        if (fields.some((k) => !/^[a-z_]+$/.test(k)))
          throw Error("Campo inválido");
        rows = (
          await db.query(
            `insert into controlgps.${table}(${fields.join(",")}) values(${fields.map((_, i) => "$" + (i + 1)).join(",")}) returning *`,
            fields.map((k) => args[k]),
          )
        ).rows;
      } else {
        const id = url.searchParams.get("id");
        rows = (
          await db.query(
            `select * from controlgps.${table}${id ? " where id=$1" : ""}`,
            id ? [id.replace("eq.", "")] : [],
          )
        ).rows;
      }
      if (request.headers().accept?.includes("vnd.pgrst.object"))
        return reply(rows[0] || null);
      return reply(rows);
    } catch (error) {
      return reply({ message: (error as Error).message, code: "P0001" }, 400);
    }
  });
  return {
    db,
    projectId,
    setOffline: (value: boolean) => {
      offline = value;
    },
  };
}
export async function login(page: Page) {
  await page.goto("/");
  await page
    .getByLabel("Correo de inicio de sesión")
    .fill("prueba@example.com");
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("ContraseñaDePrueba123!");
  await page.locator(".login-form button.primary").click();
}
export async function setGPS(page: Page, gps: TestGPS) {
  await page.evaluate(
    (value) =>
      (window as unknown as { emitGPS: (gps: TestGPS) => void }).emitGPS(value),
    gps,
  );
}
