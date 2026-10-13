import { useEffect, useState } from "react";
import { supabase, friendlyError } from "./lib";
import { Building2, LogOut, UserPlus } from "lucide-react";
type Invite = {
  id: string;
  company_name: string;
  full_name: string;
  expires_at: string;
};
export default function Onboarding({
  onComplete,
}: {
  onComplete: () => Promise<void>;
}) {
  const [invitations, setInvitations] = useState<Invite[]>([]),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [message, setMessage] = useState(""),
    [company, setCompany] = useState(""),
    [name, setName] = useState("");
  const load = async () => {
    const r = await supabase!.rpc("my_invitations");
    if (r.error) throw r.error;
    setInvitations(r.data || []);
  };
  useEffect(() => {
    supabase!.auth.getUser().then(({ data }) => {
      setName(data.user?.user_metadata.full_name || "");
      setCompany(data.user?.user_metadata.controlgps_company_name || "");
    });
    load()
      .catch((e) => setMessage(friendlyError(e)))
      .finally(() => setLoading(false));
  }, []);
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await fn();
      await onComplete();
    } catch (e) {
      setMessage(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="setup onboarding">
      <div className="section-head">
        <h1>Tu espacio de trabajo</h1>
        <button onClick={() => void supabase!.auth.signOut()}>
          <LogOut size={16} />
          Salir
        </button>
      </div>
      <p>Elige cómo empezar. Tus datos se compartirán solo con tu empresa.</p>
      {message && (
        <div role="alert" className="notice">
          {message}
        </div>
      )}
      {loading ? (
        <div className="card">Consultando invitaciones…</div>
      ) : invitations.length > 0 ? (
        <section className="card">
          <h2>
            <UserPlus size={20} /> Invitaciones para tu cuenta
          </h2>
          <p>
            Tu correo tiene invitaciones pendientes. Al aceptar ingresarás como
            empleado.
          </p>
          {invitations.map((i) => (
            <div className="invitation-row" key={i.id}>
              <div>
                <strong>{i.company_name}</strong>
                <small>
                  {i.full_name} · Invitación válida por 7 días desde su envío
                </small>
              </div>
              <button
                disabled={busy}
                className="primary"
                onClick={() =>
                  void run(async () => {
                    const r = await supabase!.rpc("accept_invitation", {
                      p_invitation: i.id,
                    });
                    if (r.error) throw r.error;
                  })
                }
              >
                Aceptar invitación
              </button>
            </div>
          ))}
        </section>
      ) : (
        <div className="card">
          <h2>¿Te invitó tu empresa?</h2>
          <p>
            Inicia sesión con el mismo correo de la invitación. Pide al
            administrador que la envíe o la renueve si no aparece.
          </p>
          <button
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void load()
                .catch((e) => setMessage(friendlyError(e)))
                .finally(() => setBusy(false));
            }}
          >
            Actualizar invitaciones
          </button>
        </div>
      )}
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const r = await supabase!.rpc("create_company", {
              p_name: company.trim(),
              p_full_name: name.trim(),
            });
            if (r.error) throw r.error;
          });
        }}
      >
        <span className="project-icon">
          <Building2 />
        </span>
        <h2>Crear una empresa</h2>
        <p>
          Serás administrador de una empresa nueva. Si eres empleado, acepta la
          invitación de tu empresa.
        </p>
        <label>
          Nombre de la empresa
          <input
            required
            minLength={2}
            maxLength={120}
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            autoComplete="organization"
          />
        </label>
        <label>
          Tu nombre completo
          <input
            required
            minLength={2}
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
        </label>
        <button disabled={busy} className="primary">
          Crear mi empresa
        </button>
      </form>
    </div>
  );
}
