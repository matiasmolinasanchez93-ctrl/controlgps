import { useState, type FormEvent } from "react";
import { supabase, friendlyError } from "./lib";
import { Building2, Mail, ArrowLeft } from "lucide-react";
type Mode = "login" | "signup" | "recover";
export default function AuthPanel() {
  const [mode, setMode] = useState<Mode>("login"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [sentEmail, setSentEmail] = useState("");
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget),
      email = String(f.get("email")).trim(),
      password = String(f.get("password") || "");
    setBusy(true);
    setMessage("");
    try {
      if (mode === "login") {
        const r = await supabase!.auth.signInWithPassword({ email, password });
        if (r.error) throw r.error;
      } else if (mode === "recover") {
        const r = await supabase!.auth.resetPasswordForEmail(email, {
          redirectTo: location.origin + "/?welcome=1",
        });
        if (r.error) throw r.error;
        setMessage(
          "Si el correo está registrado, recibirás un enlace para recuperar tu contraseña.",
        );
      } else {
        if (password !== String(f.get("confirm")))
          throw Error("Las contraseñas no coinciden.");
        const company = String(f.get("company")).trim(),
          fullName = String(f.get("full_name")).trim();
        const r = await supabase!.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: location.origin + "/?confirmed=1",
            data: { full_name: fullName, controlgps_company_name: company },
          },
        });
        if (r.error) throw r.error;
        if (!r.data.session) {
          setSentEmail(email);
          setMessage(
            "Revisa tu correo para confirmar tu cuenta. Si ya tienes una cuenta, inicia sesión o recupera tu contraseña. La empresa se creará después de verificar tu correo.",
          );
        }
      }
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };
  const switchMode = (next: Mode) => {
    setMode(next);
    setMessage("");
    setSentEmail("");
  };
  return (
    <form className="card login-form" onSubmit={submit}>
      <div className="auth-tabs">
        <button
          type="button"
          className={mode === "login" ? "active" : ""}
          onClick={() => switchMode("login")}
        >
          Iniciar sesión
        </button>
        <button
          type="button"
          className={mode === "signup" ? "active" : ""}
          onClick={() => switchMode("signup")}
        >
          Crear cuenta
        </button>
      </div>
      <h2>
        {mode === "signup"
          ? "Empieza con tu empresa"
          : mode === "recover"
            ? "Recuperar acceso"
            : "Bienvenido a ControlGPS"}
      </h2>
      <p>
        {mode === "signup"
          ? "Crea tu cuenta, confirma tu correo y configura tu espacio de trabajo."
          : mode === "recover"
            ? "Te enviaremos un enlace seguro."
            : "Ingresa a tu empresa o acepta una invitación."}
      </p>
      {mode === "signup" && (
        <>
          <label>
            Nombre de tu empresa
            <input
              name="company"
              required
              minLength={2}
              maxLength={120}
              autoComplete="organization"
              placeholder="Ej. Constructora Soltec"
            />
          </label>
          <label>
            Tu nombre completo
            <input
              name="full_name"
              required
              minLength={2}
              maxLength={200}
              autoComplete="name"
            />
          </label>
        </>
      )}
      <label>
        Correo electrónico
        <input
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="username"
          placeholder="nombre@empresa.com"
        />
      </label>
      {mode !== "recover" && (
        <label>
          Contraseña
          <input
            name="password"
            type="password"
            required
            minLength={mode === "signup" ? 12 : undefined}
            autoComplete={
              mode === "signup" ? "new-password" : "current-password"
            }
          />
        </label>
      )}
      {mode === "signup" && (
        <>
          <label>
            Confirmar contraseña
            <input
              name="confirm"
              required
              type="password"
              minLength={12}
              autoComplete="new-password"
            />
          </label>
          <small>
            Al menos 12 caracteres. Tu cuenta podrá pertenecer a una empresa en
            ControlGPS. Cada empresa tiene sus propios datos.
          </small>
        </>
      )}
      <button className="primary" disabled={busy}>
        {busy
          ? "Procesando…"
          : mode === "signup"
            ? "Crear cuenta"
            : mode === "recover"
              ? "Enviar enlace"
              : "Iniciar sesión"}
      </button>
      {mode === "login" && (
        <button
          className="text-button"
          type="button"
          onClick={() => switchMode("recover")}
        >
          Olvidé mi contraseña
        </button>
      )}
      {mode === "recover" && (
        <button
          className="text-button"
          type="button"
          onClick={() => switchMode("login")}
        >
          <ArrowLeft size={15} />
          Volver al inicio
        </button>
      )}
      {message && (
        <div className="notice" role="alert">
          {message}
        </div>
      )}
      {sentEmail && (
        <button
          disabled={busy}
          type="button"
          onClick={async () => {
            setBusy(true);
            try {
              const r = await supabase!.auth.resend({
                type: "signup",
                email: sentEmail,
                options: { emailRedirectTo: location.origin + "/?confirmed=1" },
              });
              if (r.error) throw r.error;
              setMessage(
                "Solicitud enviada. Revisa tu correo y la carpeta de spam.",
              );
            } catch (error) {
              setMessage(friendlyError(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Mail size={15} />
          Reenviar confirmación
        </button>
      )}
      <div className="auth-note">
        <Building2 size={16} />
        ¿Eres empleado? Usa la cuenta indicada en tu invitación. Si necesitas
        registrarte, podrás aceptar la invitación después de verificar tu
        correo.
      </div>
    </form>
  );
}
