import { createClient } from "npm:@supabase/supabase-js@2";
const origins = (Deno.env.get("CONTROLGPS_APP_ORIGINS") || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  const headers = {
    "Access-Control-Allow-Origin": origins.includes(origin) ? origin : "null",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    Vary: "Origin",
  };
  const reply = (status: number, message: string) =>
    new Response(JSON.stringify({ message }), { status, headers });
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return reply(405, "Método no permitido.");
  if (!origins.includes(origin)) return reply(403, "Origen no permitido.");
  try {
    const url = Deno.env.get("SUPABASE_URL")!,
      anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const token = req.headers.get("authorization")?.replace(/^Bearer /i, "");
    if (!token) return reply(401, "Inicia sesión.");
    const client = createClient(url, anon, {
      db: { schema: "controlgps" },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser(token);
    if (authError || !user) return reply(401, "Sesión expirada.");
    const { data: profile } = await client
      .from("profiles")
      .select("role,active")
      .eq("id", user.id)
      .single();
    if (!profile?.active || profile.role !== "admin")
      return reply(403, "Acceso denegado.");
    const { email, full_name } = await req.json();
    if (
      typeof email !== "string" ||
      !/^\S+@\S+\.\S+$/.test(email) ||
      typeof full_name !== "string" ||
      !full_name.trim() ||
      full_name.length > 200
    )
      return reply(400, "Nombre y correo válidos requeridos.");
    const admin = createClient(
      url,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const { error } = await admin.auth.admin.inviteUserByEmail(email.trim(), {
      data: { full_name: full_name.trim(), controlgps_enrolled: true },
      redirectTo: origin + "/?welcome=1",
    });
    if (error) {
      console.error("Invitación fallida", error.code);
      return reply(
        400,
        "No se pudo enviar la invitación. Revisa el correo, usuarios existentes y SMTP.",
      );
    }
    return reply(200, "Invitación enviada.");
  } catch {
    return reply(500, "No se pudo procesar la invitación.");
  }
});
