import { useState } from "react";
import type { CompanyInvitation } from "./types";
import { supabase, dateGT, friendlyError } from "./lib";
export default function InvitationsPanel({
  invitations,
  onSaved,
}: {
  invitations: CompanyInvitation[];
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <section className="card">
      <div className="section-head">
        <h2>Invitaciones de tu empresa</h2>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(location.origin);
              setMessage("Enlace de acceso copiado.");
            } catch {
              setMessage("Enlace de acceso: " + location.origin);
            }
          }}
        >
          Copiar enlace de acceso
        </button>
      </div>
      <p>
        Los empleados deben iniciar sesión con el correo invitado y aceptar la
        invitación. Para renovar una invitación pendiente, vuelve a enviarla
        desde el formulario.
      </p>
      {message && (
        <div className="notice" role="alert">
          {message}
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Correo</th>
              <th>Estado</th>
              <th>Vence</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {invitations.map((i) => {
              const pending = !i.accepted_at && !i.revoked_at;
              return (
                <tr key={i.id}>
                  <td>{i.full_name}</td>
                  <td>{i.email}</td>
                  <td>
                    <span className="badge">
                      {i.accepted_at
                        ? "Aceptada"
                        : i.revoked_at
                          ? "Revocada"
                          : new Date(i.expires_at).getTime() < Date.now()
                            ? "Expirada"
                            : "Pendiente de aceptación"}
                    </span>
                  </td>
                  <td>{dateGT(i.expires_at)}</td>
                  <td>
                    {pending && (
                      <button
                        disabled={busy}
                        onClick={async () => {
                          if (!confirm("¿Revocar esta invitación?")) return;
                          setBusy(true);
                          try {
                            const r = await supabase!.rpc("revoke_invitation", {
                              p_invitation: i.id,
                            });
                            if (r.error) throw r.error;
                            await onSaved();
                            setMessage("Invitación revocada.");
                          } catch (e) {
                            setMessage(friendlyError(e));
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Revocar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {invitations.length === 0 && (
        <p>No hay invitaciones pendientes. Agrega tu primer empleado.</p>
      )}
    </section>
  );
}
