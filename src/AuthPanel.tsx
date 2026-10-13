import { useState, type FormEvent } from "react";
import { supabase, friendlyError } from "./lib";
import { Building2, ArrowLeft } from "lucide-react";
type Mode = "login" | "signup" | "recover";
export default function AuthPanel() {
  const [mode, setMode] = useState<Mode>("login"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
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
      } else {
        if (password !== String(f.get("confirm")))
          throw Error("Las contraseñas no coinciden.");
        if (mode === "signup") {
          const r = await supabase!.auth.signUp({
            email,
            password,
            options: {
              data: {
                full_name: String(f.get("full_name")).trim(),
                controlgps_company_name: String(f.get("company") || "").trim(),
              },
            },
          });
          if (r.error) throw r.error;
          if (!r.data.session)
            throw Error(
              "No se obtuvo una sesión. Si ya tienes cuenta, inicia sesión. Si es un registro nuevo, el servicio debe tener desactivada la confirmación de correo.",
            );
        } else {
          const r = await supabase!.functions.invoke(
            "controlgps-recover-account",
            { body: { email, password, code: String(f.get("code")).trim() } },
          );
          if (r.error) {
            const context = (r.error as { context?: Response }).context;
            const body = context
              ? await context.json().catch(() => null)
              : null;
            throw Error(body?.message || "No se pudo recuperar la cuenta.");
          }
          setMessage(r.data.message);
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
  };
  return (
    <form className="card login-form" onSubmit={submit}>
      <div className="auth-tabs">
        <button
          disabled={busy}
          type="button"
          className={mode === "login" ? "active" : ""}
          onClick={() => switchMode("login")}
        >
          Iniciar sesión
        </button>
        <button
          disabled={busy}
          type="button"
          className={mode === "signup" ? "active" : ""}
          onClick={() => switchMode("signup")}
        >
          Crear cuenta
        </button>
      </div>
      <h2>
        {mode === "signup"
          ? "Crea tu cuenta sin esperar un correo"
          : mode === "recover"
            ? "Recuperar con clave privada"
            : "Bienvenido a ControlGPS"}
      </h2>
      <p>
        {mode === "signup"
          ? "El acceso es inmediato. Después podrás crear una empresa o ingresar con un código privado."
          : mode === "recover"
            ? "Usa la clave de recuperación que guardaste en Seguridad. No se enviará correo."
            : "Ingresa a tu empresa con tu cuenta y contraseña."}
      </p>
      {mode === "signup" && (
        <>
          <label>
            Nombre de tu empresa (opcional para empleados)
            <input
              name="company"
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
        Correo de inicio de sesión
        <input
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="username"
          placeholder="nombre@empresa.com"
        />
      </label>
      {mode === "recover" && (
        <label>
          Clave privada de recuperación
          <input
            name="code"
            required
            minLength={60}
            maxLength={120}
            autoComplete="off"
            spellCheck={false}
            placeholder="RC-…"
          />
        </label>
      )}
      <label>
        {mode === "recover" ? "Nueva contraseña" : "Contraseña"}
        <input
          name="password"
          type="password"
          required
          minLength={mode === "login" ? undefined : 12}
          maxLength={128}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
      </label>
      {mode !== "login" && (
        <label>
          Confirmar contraseña
          <input
            name="confirm"
            required
            type="password"
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
          />
        </label>
      )}
      {mode === "signup" && (
        <small>
          Tu contraseña protege la cuenta. El correo se usa como identificador,
          no como identidad verificada. Las invitaciones requieren un código
          secreto.
        </small>
      )}
      <button className="primary" disabled={busy}>
        {busy
          ? "Procesando…"
          : mode === "signup"
            ? "Crear cuenta"
            : mode === "recover"
              ? "Restablecer contraseña"
              : "Iniciar sesión"}
      </button>
      {mode === "login" && (
        <button
          disabled={busy}
          className="text-button"
          type="button"
          onClick={() => switchMode("recover")}
        >
          Olvidé mi contraseña
        </button>
      )}
      {mode === "recover" && (
        <>
          <button
            disabled={busy}
            className="text-button"
            type="button"
            onClick={() => switchMode("login")}
          >
            <ArrowLeft size={15} />
            Volver al inicio
          </button>
          <small>
            Si no guardaste una clave, contacta al propietario del servicio. No
            se recuperan cuentas solo por declarar un correo.
          </small>
        </>
      )}
      {message && (
        <div className="notice" role="alert">
          {message}
        </div>
      )}
      <div className="auth-note">
        <Building2 size={16} />
        ¿Eres empleado? Crea tu cuenta y solicita a tu administrador el código
        privado. Puedes usar cualquier correo disponible para tu cuenta; la
        autorización depende del código.
      </div>
    </form>
  );
}
