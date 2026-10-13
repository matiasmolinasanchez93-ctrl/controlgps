import { createClient } from "npm:@supabase/supabase-js@2";
const origins = (Deno.env.get("CONTROLGPS_APP_ORIGINS") || "")
  .split(",")
  .map((v) => v.trim());
Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  const headers = {
    "Access-Control-Allow-Origin": origins.includes(origin) ? origin : "null",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
  const reply = (status: number, message: string) =>
    new Response(JSON.stringify({ message }), { status, headers });
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST" || !origins.includes(origin))
    return reply(403, "Solicitud no permitida.");
  try {
    const raw = await req.text();
    if (raw.length > 4096) return reply(413, "Solicitud demasiado grande.");
    const { email, code, password } = JSON.parse(raw);
    if (
      typeof email !== "string" ||
      !/^\S+@\S+\.\S+$/.test(email) ||
      typeof code !== "string" ||
      code.length > 120 ||
      typeof password !== "string" ||
      password.length < 12 ||
      password.length > 128
    )
      return reply(
        400,
        "Correo, clave y contraseña de 12 a 128 caracteres requeridos.",
      );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      {
        db: { schema: "controlgps" },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const { data: claim, error } = await admin.rpc("claim_recovery", {
      p_email: email.trim().toLowerCase(),
      p_code: code,
    });
    if (error)
      return reply(
        503,
        "No se pudo verificar la clave. Intenta de nuevo más tarde.",
      );
    if (claim?.limited)
      return reply(429, "Demasiados intentos. Espera 15 minutos.");
    if (!claim?.user_id)
      return reply(400, "Correo o clave de recuperación inválidos.");
    const { error: updateError } = await admin.auth.admin.updateUserById(
      claim.user_id,
      { password },
    );
    const { data: finished, error: finishError } = await admin.rpc(
      "finish_recovery",
      {
        p_user: claim.user_id,
        p_claim: claim.claim_id,
        p_success: !updateError,
      },
    );
    if (updateError)
      return reply(
        400,
        "No se pudo guardar la contraseña. Usa una contraseña fuerte e intenta de nuevo.",
      );
    if (finishError || !finished)
      return reply(
        503,
        "La contraseña pudo cambiar, pero no se completó la revocación de sesiones. Intenta iniciar sesión y contacta al administrador del servicio.",
      );
    // Revoke refresh tokens in shared Auth without sending email. ControlGPS RLS also blocks old access JWTs immediately.
    const login = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: session } = await login.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (!session.session)
      return reply(
        503,
        "Contraseña cambiada y sesiones antiguas de ControlGPS bloqueadas; no se confirmó la revocación global de Auth. Contacta al administrador del servicio.",
      );
    const { error: logoutError } = await admin.auth.admin.signOut(
      session.session.access_token,
      "global",
    );
    if (logoutError)
      return reply(
        503,
        "Contraseña cambiada y sesiones antiguas de ControlGPS bloqueadas; no se confirmó la revocación global de Auth. Contacta al administrador del servicio.",
      );
    return reply(
      200,
      "Contraseña cambiada. Inicia sesión y genera una nueva clave de recuperación; la anterior ya fue utilizada.",
    );
  } catch {
    return reply(
      500,
      "No se pudo completar la recuperación. No se confirmó el cambio.",
    );
  }
});
