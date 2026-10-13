import { useEffect, useState } from "react";
import { supabase, friendlyError } from "./lib";
import { Building2, LogOut, KeyRound } from "lucide-react";
export default function Onboarding({
  onComplete,
}: {
  onComplete: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [company, setCompany] = useState(""),
    [name, setName] = useState(""),
    [code, setCode] = useState("");
  useEffect(() => {
    supabase!.auth.getUser().then(({ data }) => {
      setName(data.user?.user_metadata.full_name || "");
      setCompany(data.user?.user_metadata.controlgps_company_name || "");
    });
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
        <button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const r = await supabase!.auth.signOut();
              if (r.error) throw r.error;
            })
          }
        >
          <LogOut size={16} />
          Salir
        </button>
      </div>
      <p>
        Crea tu empresa o ingresa con el código privado que te entregó tu
        administrador.
      </p>
      {message && (
        <div role="alert" className="notice">
          {message}
        </div>
      )}
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const r = await supabase!.rpc("accept_invitation_code", {
              p_code: code,
            });
            if (r.error) throw r.error;
            if (!r.data?.ok)
              throw Error(r.data?.message || "Código no válido.");
          });
        }}
      >
        <h2>
          <KeyRound size={20} />
          Ingresar con código de empresa
        </h2>
        <p>
          El código es personal, vence en 7 días y solo se puede usar una vez.
          El correo por sí solo no concede acceso.
        </p>
        <label>
          Código privado de invitación
          <input
            name="invitation_code"
            required
            minLength={32}
            maxLength={100}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="CG-…"
          />
        </label>
        <button disabled={busy} className="primary">
          Unirme a la empresa
        </button>
      </form>
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
          Serás administrador de tu empresa nueva. Si eres empleado, usa el
          código privado de tu empresa.
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
      <div className="notice">
        El correo es un identificador de inicio de sesión, sin verificación de
        propiedad. Al ingresar guarda una clave personal de recuperación desde
        Seguridad. Nadie debe pedirte tu contraseña o esa clave.
      </div>
    </div>
  );
}
