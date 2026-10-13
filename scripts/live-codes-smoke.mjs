// Authorized hosted smoke test. No email is sent. The script outputs only test IDs for cleanup.
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((v) => v.includes("="))
    .map((v) => {
      const n = v.indexOf("=");
      return [v.slice(0, n), v.slice(n + 1)];
    }),
);
const origin = "https://controlgps-cyan.vercel.app",
  ids = [];
const client = () =>
  createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    db: { schema: "controlgps" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
const must = (r, label) => {
  if (r.error) throw Error(label + ": " + r.error.message);
  return r.data;
};
const assert = (v, label) => {
  if (!v) throw Error(label);
};
const suffix = randomBytes(8).toString("hex"),
  password = randomBytes(24).toString("base64url") + "aA1!",
  nextPassword = randomBytes(24).toString("base64url") + "bB2!";
try {
  const owner = client(),
    employee = client();
  const ownerEmail = `cg-smoke-owner-${suffix}@invalid.example`,
    employeeEmail = `cg-smoke-worker-${suffix}@invalid.example`;
  const weak = await owner.auth.signUp({
    email: `cg-smoke-weak-${suffix}@invalid.example`,
    password: "short",
  });
  assert(weak.error, "El servidor aceptó una contraseña débil");
  if (weak.data?.user) ids.push(weak.data.user.id);
  const signed = must(
    await owner.auth.signUp({ email: ownerEmail, password }),
    "Registro administrador",
  );
  if (signed.user) ids.push(signed.user.id);
  assert(signed.session, "El registro sigue requiriendo correo");
  const company = must(
    await owner.rpc("create_company", {
      p_name: "Smoke temporal " + suffix,
      p_full_name: "Administrador temporal",
    }),
    "Empresa",
  );
  const invitation = must(
    await owner.functions.invoke("controlgps-invite-employee", {
      headers: { Origin: origin },
      body: { email: employeeEmail, full_name: "Empleado temporal" },
    }),
    "Código de empresa",
  );
  assert(invitation.code?.startsWith("CG-"), "No se generó código");
  const worker = must(
    await employee.auth.signUp({ email: employeeEmail, password }),
    "Registro empleado",
  );
  if (worker.user) ids.push(worker.user.id);
  assert(worker.session, "Empleado no obtuvo sesión inmediata");
  const joined = must(
    await employee.rpc("accept_invitation_code", { p_code: invitation.code }),
    "Canjear código",
  );
  assert(joined.ok, "No se aceptó código");
  const profile = must(
    await employee
      .from("profiles")
      .select("company_id,role")
      .eq("id", worker.user.id)
      .single(),
    "Perfil",
  );
  assert(
    profile.company_id === company && profile.role === "employee",
    "Membresía incorrecta",
  );
  must(
    await employee.auth.signInWithPassword({ email: employeeEmail, password }),
    "Reautenticar",
  );
  const recovery = must(
    await employee.rpc("generate_recovery_code"),
    "Clave de recuperación",
  );
  assert(recovery.code?.startsWith("RC-"), "No se generó clave personal");
  const reset = must(
    await employee.functions.invoke("controlgps-recover-account", {
      headers: { Origin: origin },
      body: {
        email: employeeEmail,
        code: recovery.code,
        password: nextPassword,
      },
    }),
    "Recuperación",
  );
  assert(
    reset.message?.includes("Contraseña cambiada"),
    "Recuperación incompleta",
  );
  const oldValid = must(
    await employee.rpc("session_is_valid"),
    "Sesión anterior",
  );
  assert(oldValid === false, "La sesión anterior no fue invalidada");
  const reused = await employee.functions.invoke("controlgps-recover-account", {
    headers: { Origin: origin },
    body: { email: employeeEmail, code: recovery.code, password: nextPassword },
  });
  assert(reused.error, "La clave fue reutilizada");
  must(
    await employee.auth.signInWithPassword({
      email: employeeEmail,
      password: nextPassword,
    }),
    "Login nueva contraseña",
  );
  assert(
    must(await employee.rpc("session_is_valid"), "Nueva sesión") === true,
    "Nueva sesión inválida",
  );
  console.log(
    JSON.stringify({
      ok: true,
      registrationWithoutEmail: true,
      privateInvitation: true,
      recoveryWithoutEmail: true,
      oldSessionBlocked: true,
      testUserIds: ids,
    }),
  );
} catch (error) {
  console.log(
    JSON.stringify({ ok: false, message: error.message, testUserIds: ids }),
  );
  process.exitCode = 1;
} finally {
  if (ids.length) {
    try {
      if (ids.some((id) => !/^[0-9a-f-]{36}$/.test(id)))
        throw Error("ID no válido para limpieza");
      mkdirSync("supabase/.temp", { recursive: true });
      const path = resolve("supabase/.temp/smoke-cleanup.sql");
      writeFileSync(
        path,
        "begin;select set_config('controlgps.smoke_user_ids','{" +
          ids.join(",") +
          "}',true);\n" +
          readFileSync("scripts/smoke-cleanup.sql", "utf8") +
          "\ncommit;",
      );
      let cleanupOutput;
      if (process.platform === "win32")
        cleanupOutput = execFileSync(
          "powershell.exe",
          [
            "-NoProfile",
            "-Command",
            "& supabase db query --linked --file '" +
              path.replaceAll("'", "''") +
              "';if($LASTEXITCODE -ne 0){exit 1}",
          ],
          { stdio: "pipe" },
        );
      else
        cleanupOutput = execFileSync(
          "supabase",
          ["db", "query", "--linked", "--file", path],
          {
            stdio: "pipe",
          },
        );
      if (/"_tag"\s*:\s*"Error"/.test(cleanupOutput.toString()))
        throw Error("El servidor rechazó la limpieza");
      unlinkSync(path);
      console.log(JSON.stringify({ cleanup: true }));
    } catch {
      console.log(
        JSON.stringify({
          cleanup: false,
          message:
            "Revisar scripts/smoke-cleanup.sql con los IDs temporales indicados.",
        }),
      );
      process.exitCode = 1;
    }
  }
}
