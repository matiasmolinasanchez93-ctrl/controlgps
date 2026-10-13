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
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST" || !origins.includes(origin))
    return reply(403, { message: "Solicitud no permitida." });
  try {
    const token = req.headers.get("authorization")?.replace(/^Bearer /i, "");
    if (!token) return reply(401, { message: "Inicia sesión." });
    const client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        db: { schema: "controlgps" },
        global: { headers: { Authorization: "Bearer " + token } },
      },
    );
    const {
      data: { user },
      error,
    } = await client.auth.getUser(token);
    if (error || !user) return reply(401, { message: "Sesión expirada." });
    const body = await req.text();
    if (body.length > 4096)
      return reply(413, { message: "Solicitud demasiado grande." });
    const { email, full_name } = JSON.parse(body);
    if (typeof email !== "string" || typeof full_name !== "string")
      return reply(400, {
        message: "Nombre y correo de referencia requeridos.",
      });
    const { data, error: rpcError } = await client.rpc(
      "issue_invitation_code",
      { p_email: email, p_name: full_name },
    );
    if (rpcError) return reply(400, { message: rpcError.message });
    return reply(200, {
      ...data,
      message:
        "Código generado. Entrégalo personalmente o por un canal privado al empleado. No se envió correo.",
    });
  } catch {
    return reply(500, { message: "No se pudo generar el código." });
  }
});
