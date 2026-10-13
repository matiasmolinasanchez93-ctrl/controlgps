import { useState } from "react";
import type { Company } from "./types";
import { supabase, friendlyError } from "./lib";
export default function CompanySettings({
  company,
  onSaved,
}: {
  company: Company;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(company.name),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <section className="card">
      <h2>Datos de tu empresa</h2>
      <p>
        Este nombre identifica el espacio de trabajo y aparece en las
        invitaciones.
      </p>
      <form
        className="company-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMessage("");
          try {
            const r = await supabase!
              .from("companies")
              .update({ name: name.trim() })
              .eq("id", company.id)
              .select("id")
              .single();
            if (r.error) throw r.error;
            await onSaved();
            setMessage("Nombre de empresa actualizado.");
          } catch (error) {
            setMessage(friendlyError(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Nombre de la empresa
          <input
            required
            minLength={2}
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button disabled={busy} className="primary">
          Guardar cambios
        </button>
      </form>
      {message && (
        <div role="alert" className="notice">
          {message}
        </div>
      )}
      <div className="notice">
        Cada empresa tiene proyectos, empleados y reportes separados. Las
        cuentas de Supabase comparten autenticación con Business Helper: un
        cambio de contraseña también afecta el acceso a esa aplicación.
      </div>
      <p className="caption">
        Una cuenta pertenece a una empresa en este MVP. No se permite cambiarla
        de empresa para conservar la integridad del historial. Usa otra cuenta
        para administrar una empresa distinta.
      </p>
    </section>
  );
}
