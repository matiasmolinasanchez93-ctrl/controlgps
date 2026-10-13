import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL,
  key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase =
  url && key && !url.includes("TU-PROYECTO") && !key.includes("TU-CLAVE")
    ? createClient(url, key, {
        db: { schema: import.meta.env.VITE_SUPABASE_SCHEMA || "controlgps" },
      })
    : null;
export const dateGT = (value: string) =>
  new Intl.DateTimeFormat("es-GT", {
    timeZone: "America/Guatemala",
    dateStyle: "short",
    timeStyle: "short",
    hourCycle: "h23",
  }).format(new Date(value));
export const dayGT = (value: string | number = Date.now()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guatemala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
export async function readAll<T>(
  table: string,
  order: string,
  ascending = true,
): Promise<T[]> {
  const rows: T[] = [];
  // Explicit pagination avoids Supabase's default row cap silently truncating reports.
  for (let offset = 0; ; offset += 500) {
    const result = await supabase!
      .from(table)
      .select("*")
      .order(order, { ascending })
      .order("id")
      .range(offset, offset + 499)
      .returns<T[]>();
    if (result.error) throw result.error;
    rows.push(...(result.data || []));
    if (!result.data || result.data.length < 500) return rows;
  }
}
export const hours = (start: string, end: string | null) =>
  end
    ? (
        Math.max(0, new Date(end).getTime() - new Date(start).getTime()) /
        3600000
      ).toFixed(2)
    : "—";
export function csvDownload(rows: string[][]) {
  const cell = (v: string) =>
    '"' + (/^[=+\-@\t\r]/.test(v) ? "'" : "") + v.replaceAll('"', '""') + '"';
  const blob = new Blob(
    ["\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n")],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `asistencias-${dayGT()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
export function friendlyError(error: unknown) {
  const m =
    error instanceof Error
      ? error.message
      : String((error as { message?: string })?.message || error);
  if (/fetch|network/i.test(m))
    return "Sin conexión. La operación no se confirmó; revisa los registros antes de reintentar.";
  if (/Invalid login/i.test(m)) return "Correo o contraseña incorrectos.";
  if (/JWT|expired/i.test(m))
    return "La sesión expiró. Inicia sesión de nuevo.";
  if (/rate limit/i.test(m)) return "Demasiados intentos. Espera unos minutos.";
  if (/one_open_shift|duplicate key/i.test(m))
    return "El empleado ya tiene una jornada abierta. Actualiza los registros antes de continuar.";
  if (/check_out_after_check_in/i.test(m))
    return "La salida debe ser posterior a la entrada.";
  if (/permission denied|row.level security/i.test(m))
    return "No tienes permiso para esta operación. Contacta al administrador.";
  if (/Password/i.test(m))
    return "La contraseña no cumple la política de seguridad. Usa al menos 12 caracteres con letras, números y símbolos.";
  if (/Email.*invalid|invalid.*email/i.test(m))
    return "El correo electrónico no es válido.";
  return m;
}
