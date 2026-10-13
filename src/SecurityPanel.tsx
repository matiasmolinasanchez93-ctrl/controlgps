import { useEffect, useState } from "react";
import { supabase, friendlyError } from "./lib";
import { KeyRound, Download } from "lucide-react";
export default function SecurityPanel() {
  const [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [configured, setConfigured] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    supabase!.rpc("recovery_status").then((r) => {
      if (r.error) setMessage(friendlyError(r.error));
      else setConfigured(r.data?.configured || false);
    });
  }, []);
  return (
    <section className="card">
      <h2>
        <KeyRound size={18} />
        Seguridad de tu cuenta
      </h2>
      <p>
        Guarda una clave de recuperación para cambiar tu contraseña si la
        olvidas. No necesita correo ni SMTP.
      </p>
      <div className="notice">
        {configured
          ? "Tienes una clave de recuperación vigente. Generar otra invalida la anterior."
          : "Todavía no tienes una clave de recuperación. Genera una y guárdala fuera de esta aplicación."}
      </div>
      <form
        className="company-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setMessage("");
          const password = String(
            new FormData(e.currentTarget).get("password"),
          );
          try {
            const {
              data: { user },
            } = await supabase!.auth.getUser();
            if (!user?.email) throw Error("Sesión inválida.");
            const login = await supabase!.auth.signInWithPassword({
              email: user.email,
              password,
            });
            if (login.error) throw login.error;
            const r = await supabase!.rpc("generate_recovery_code");
            if (r.error) throw r.error;
            setCode(r.data.code);
            setConfigured(true);
          } catch (error) {
            setMessage(friendlyError(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Confirma tu contraseña actual
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </label>
        <button disabled={busy} className="primary">
          Generar clave de recuperación
        </button>
      </form>
      {code && (
        <div className="notice">
          <strong>
            Guárdala ahora. Se muestra una sola vez y no podemos recuperarla.
          </strong>
          <code className="private-code">{code}</code>
          <button
            onClick={() => {
              const a = document.createElement("a");
              const url = URL.createObjectURL(
                new Blob(
                  [
                    "ControlGPS — Clave privada de recuperación\n" +
                      code +
                      "\nNo compartir. Guardar fuera de la aplicación.",
                  ],
                  { type: "text/plain;charset=utf-8" },
                ),
              );
              a.href = url;
              a.download = "controlgps-clave-recuperacion.txt";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download size={16} />
            Descargar clave
          </button>
          <button onClick={() => setCode("")}>Ya la guardé</button>
        </div>
      )}
      {message && (
        <div className="notice" role="alert">
          {message}
        </div>
      )}
      <p className="caption">
        La recuperación cambia también la contraseña del Supabase compartido con
        Business Helper. Sin contraseña, sin clave y sin una sesión abierta,
        solo el propietario del servicio puede asistir tras verificar tu
        identidad; el correo no basta.
      </p>
    </section>
  );
}
