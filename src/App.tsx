import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  MapPin,
  LayoutDashboard,
  Building2,
  Users,
  ClipboardList,
  LogOut,
  ShieldCheck,
  Download,
  Plus,
  RefreshCw,
  Navigation,
  Clock,
  Settings,
} from "lucide-react";
import {
  supabase,
  dateGT,
  dayGT,
  hours,
  csvDownload,
  friendlyError,
  readAll,
} from "./lib";
import {
  freshLocation,
  haversine,
  validateLocation,
  gpsStatus,
  type Point,
} from "./geo";
import type {
  Profile,
  Project,
  Assignment,
  Attendance,
  LocationEvent,
  Company,
  CompanyInvitation,
} from "./types";
import ZoneMap from "./Map";
import { useMonitor } from "./useMonitor";
import AuthPanel from "./AuthPanel";
import Onboarding from "./Onboarding";
import CompanySettings from "./CompanySettings";
import InvitationsPanel from "./InvitationsPanel";
import SecurityPanel from "./SecurityPanel";
const blank = {
  name: "",
  description: "",
  address: "",
  latitude: 14.6349,
  longitude: -90.5069,
  radius_m: 100,
  active: true,
};
const limitation =
  "El monitoreo funciona mientras esta página está activa y tiene permiso de ubicación. Bloquear el teléfono, cerrar la pestaña o suspender el navegador interrumpe la verificación. Esto no cierra tu jornada. El GPS es evidencia reportada por el dispositivo y puede ser alterado.";
export default function App() {
  const [session, setSession] = useState<Session | null>(null),
    [profile, setProfile] = useState<Profile | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [page, setPage] = useState("Resumen");
  const [company, setCompany] = useState<Company | null>(null),
    [invitations, setInvitations] = useState<CompanyInvitation[]>([]);
  const [invitationCode, setInvitationCode] = useState("");
  const [projects, setProjects] = useState<Project[]>([]),
    [people, setPeople] = useState<Profile[]>([]),
    [assignments, setAssignments] = useState<Assignment[]>([]),
    [sessions, setSessions] = useState<Attendance[]>([]),
    [events, setEvents] = useState<LocationEvent[]>([]);
  const [selected, setSelected] = useState(""),
    [consent, setConsent] = useState(false),
    [preview, setPreview] = useState<Point | null>(null),
    [permission, setPermission] = useState("Sin consultar"),
    [reason, setReason] = useState("");
  const [editor, setEditor] = useState<(typeof blank & { id?: string }) | null>(
      null,
    ),
    [search, setSearch] = useState(""),
    [employeeFilter, setEmployeeFilter] = useState(""),
    [projectFilter, setProjectFilter] = useState(""),
    [from, setFrom] = useState(dayGT()),
    [to, setTo] = useState(dayGT()),
    [now, setNow] = useState(Date.now()),
    [adjust, setAdjust] = useState<Attendance | null>(null),
    [welcome, setWelcome] = useState(
      new URLSearchParams(location.search).has("welcome") ||
        location.hash.includes("type=recovery"),
    );
  const notify = useCallback((m: string) => setMessage(m), []);
  const open = sessions.find(
    (s) => !s.check_out_at && s.employee_id === profile?.id,
  );
  const monitor = useMonitor(
    profile?.role === "employee" && profile.active ? open?.id : undefined,
    consent,
    notify,
  );
  const activeProject = projects.find(
    (p) => p.id === (open?.project_id || selected),
  );
  const refresh = useCallback(async () => {
    if (!supabase) return;
    const {
      data: { user },
      error: userError,
    } = await supabase!.auth.getUser();
    if (userError) throw userError;
    if (!user) throw Error("La sesión expiró.");
    const valid = await supabase!.rpc("session_is_valid");
    if (valid.error) throw valid.error;
    if (!valid.data) {
      await supabase!.auth.signOut({ scope: "local" });
      throw Error("Sesión revocada. Inicia sesión con tu contraseña actual.");
    }
    const result = await supabase!
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    if (result.error) throw Error(result.error.message);
    setProfile(result.data);
    if (!result.data) {
      setCompany(null);
      setProjects([]);
      setPeople([]);
      setAssignments([]);
      setSessions([]);
      setEvents([]);
      setInvitations([]);
      return;
    }
    if (!result.data.active)
      throw Error("Tu cuenta está desactivada. Contacta al administrador.");
    const data = await Promise.all([
      readAll<Project>("projects", "created_at", false),
      readAll<Profile>("profiles", "full_name"),
      readAll<Assignment>("project_assignments", "created_at"),
      readAll<Attendance>("attendance_sessions", "check_in_at", false),
      readAll<LocationEvent>("location_events", "recorded_at", false),
      supabase!
        .from("companies")
        .select("*")
        .eq("id", result.data.company_id)
        .single(),
      result.data.role === "admin"
        ? readAll<CompanyInvitation>("company_invitations", "created_at", false)
        : Promise.resolve([]),
    ]);
    setProjects(data[0]);
    setPeople(data[1]);
    setAssignments(data[2]);
    setSessions(data[3]);
    setEvents(data[4]);
    if (data[5].error) throw data[5].error;
    setCompany(data[5].data);
    setInvitations(data[6]);
  }, []);
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase!.auth.getSession().then(({ data, error }) => {
      if (error) notify(friendlyError(error));
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase!.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setWelcome(true);
      if (!s) {
        setInvitationCode("");
        setProfile(null);
        setCompany(null);
        setPeople([]);
        setAssignments([]);
        setEvents([]);
        setInvitations([]);
        setConsent(false);
        setProjects([]);
        setSessions([]);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [notify]);
  useEffect(() => {
    if (!session) return;
    setLoading(true);
    refresh()
      .catch((e) => notify(friendlyError(e)))
      .finally(() => setLoading(false));
    const t = setInterval(() => {
      setNow(Date.now());
      void refresh().catch((e) => notify(friendlyError(e)));
    }, 30000);
    return () => clearInterval(t);
  }, [session?.user.id, refresh, notify]);
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      if(!navigator.onLine)throw Error('Sin conexión. Reconecta antes de registrar asistencia o guardar cambios.');
      await fn();
    } catch (e) {
      notify(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const r = await supabase!.rpc(name, args);
    if (r.error) throw r.error;
    return r.data;
  };
  const change = async (
    table: string,
    id: string,
    value: Record<string, unknown>,
  ) => {
    const r = await supabase!.from(table).update(value).eq("id", id);
    if (r.error) throw r.error;
    await refresh();
  };
  const status = (s: Attendance) => {
    const e = events.find((e) => e.attendance_session_id === s.id);
    return s.check_out_at
      ? "Finalizada"
      : gpsStatus(e?.event_type, e?.recorded_at, now);
  };
  const employeeName = (id: string) =>
    people.find((p) => p.id === id)?.full_name || "Empleado";
  const projectName = (id: string) =>
    projects.find((p) => p.id === id)?.name || "Proyecto";
  const filtered = sessions.filter(
    (s) =>
      (!employeeFilter || s.employee_id === employeeFilter) &&
      (!projectFilter || s.project_id === projectFilter) &&
      (!from || dayGT(s.check_in_at) >= from) &&
      (!to || dayGT(s.check_in_at) <= to),
  );
  const exits = (s: Attendance) => {
    let previous = "inside",
      count = 0;
    for (const e of events
      .filter((e) => e.attendance_session_id === s.id)
      .slice()
      .reverse()) {
      if (e.event_type === "outside" && previous !== "outside") count++;
      if (["inside", "outside"].includes(e.event_type)) previous = e.event_type;
    }
    return count;
  };
  const reportRows = filtered.map((s) => [
    employeeName(s.employee_id),
    projectName(s.project_id),
    dateGT(s.check_in_at),
    s.check_out_at ? dateGT(s.check_out_at) : "Jornada abierta",
    hours(s.check_in_at, s.check_out_at),
    String(exits(s)),
    status(s),
    s.check_out_reason || "",
  ]);
  const checkIn = () =>
    void run(async () => {
      if (!activeProject) throw Error("Selecciona un proyecto asignado.");
      if (!consent) throw Error("Acepta el monitoreo antes de iniciar.");
      notify("Verificando ubicación…");
      const p = await freshLocation();
      setPermission("Permitido");
      setPreview(p);
      validateLocation(p, activeProject, activeProject.radius_m);
      const s = await rpc("check_in", {
        p_project: activeProject.id,
        p_lat: p.latitude,
        p_lng: p.longitude,
        p_accuracy: p.accuracy,
        p_measured: new Date(p.timestamp).toISOString(),
      });
      await refresh();
      notify("Entrada registrada · " + dateGT(s.check_in_at));
    });
  const checkOut = () =>
    void run(async () => {
      let p: Point | null = null;
      try {
        p = await freshLocation();
        if (p.accuracy > 50) p = null;
      } catch {
        /* Checkout may continue without location, with a documented reason. */
      }
      const s = await rpc("check_out", {
        p_lat: p?.latitude ?? null,
        p_lng: p?.longitude ?? null,
        p_accuracy: p?.accuracy ?? null,
        p_measured: p ? new Date(p.timestamp).toISOString() : null,
        p_reason: reason,
      });
      await refresh();
      setConsent(false);
      setPreview(null);
      notify(
        "Salida registrada · " +
          dateGT(s.check_out_at) +
          " · " +
          hours(s.check_in_at, s.check_out_at) +
          " horas",
      );
    });
  if (!supabase)
    return (
      <div className="setup">
        <Brand />
        <div className="card">
          <span className="eyebrow">CONFIGURACIÓN REQUERIDA</span>
          <h1>Conecta tu equipo con ControlGPS</h1>
          <p>
            La aplicación necesita Supabase para autenticar usuarios y registrar
            asistencias reales.
          </p>
          <ol>
            <li>Crea un proyecto Supabase y ejecuta la migración SQL.</li>
            <li>
              Copia .env.example a .env y configura la URL y clave pública.
            </li>
            <li>
              Despliega la función controlgps-invite-employee y crea el
              administrador inicial.
            </li>
            <li>
              Ejecuta npm run dev. Consulta README.md para los pasos exactos.
            </li>
          </ol>
          <div className="notice">
            No hay datos de demostración ni registros de asistencia simulados.
          </div>
        </div>
      </div>
    );
  if (!session)
    return (
      <div className="login">
        <div className="login-story">
          <Brand />
          <span className="eyebrow">TU EQUIPO. EN EL LUGAR CORRECTO.</span>
          <h1>
            Asistencia clara.
            <br />
            Proyectos bajo control.
          </h1>
          <p>
            Gestiona jornadas, verifica ubicaciones y consulta las horas de tu
            equipo en un solo lugar.
          </p>
          <div className="story-note">
            <ShieldCheck /> Acceso seguro · Horario de Guatemala
          </div>
        </div>
        <AuthPanel />
      </div>
    );
  if (welcome)
    return (
      <div className="setup">
        <Brand />
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            const password = String(
              new FormData(e.currentTarget).get("password"),
            );
            void run(async () => {
              const r = await supabase!.auth.updateUser({ password });
              if (r.error) throw r.error;
              setWelcome(false);
              history.replaceState(null, "", location.pathname);
              notify("Contraseña guardada.");
            });
          }}
        >
          <h1>Configura tu contraseña</h1>
          <label>
            Nueva contraseña
            <input
              name="password"
              required
              minLength={12}
              type="password"
              autoComplete="new-password"
            />
          </label>
          <button className="primary" disabled={busy}>
            Guardar contraseña
          </button>
          <p role="alert">{message}</p>
        </form>
      </div>
    );
  if (!profile) {
    return loading ? (
      <div className="setup">
        <Brand />
        <div className="card">Verificando tu cuenta…</div>
      </div>
    ) : (
      <Onboarding onComplete={refresh} />
    );
  }
  const admin = profile?.role === "admin";
  const menu = admin
    ? ([
        ["Resumen", LayoutDashboard],
        ["Proyectos", Building2],
        ["Empleados", Users],
        ["Asistencias", ClipboardList],
        ["Empresa", Settings],
        ["Seguridad", ShieldCheck],
      ] as const)
    : ([
        ["Mi jornada", Navigation],
        ["Historial", ClipboardList],
        ["Seguridad", ShieldCheck],
      ] as const);
  const todayStart = new Date(dayGT(now) + "T00:00:00-06:00").getTime();
  const todayHours = sessions.reduce(
    (sum, s) =>
      sum +
      (s.check_out_at
        ? Math.max(
            0,
            Math.min(
              new Date(s.check_out_at).getTime(),
              todayStart + 86400000,
            ) - Math.max(new Date(s.check_in_at).getTime(), todayStart),
          ) / 3600000
        : 0),
    0,
  );
  return (
    <div className="app">
      <aside>
        <Brand />
        <div className="workspace-label">ESPACIO DE TRABAJO</div>
        <nav>
          {menu.map(([label, Icon]) => (
            <button
              key={label}
              className={
                page === label ||
                (page === "Resumen" && !admin && label === "Mi jornada")
                  ? "active"
                  : ""
              }
              onClick={() => setPage(label)}
            >
              <Icon size={19} />
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <ShieldCheck size={18} />
          <span>
            Control de asistencia
            <br />
            <small>America/Guatemala</small>
          </span>
        </div>
      </aside>
      <div className="main">
        <header>
          <div>
            <span className="dot" /> {company?.name || "Gestión por proyecto"}
          </div>
          <div className="user">
            <span className="avatar">
              {profile?.full_name.charAt(0) || "…"}
            </span>
            <span>
              {profile?.full_name}
              <small>{admin ? "Administrador" : "Empleado"}</small>
            </span>
            <button
              aria-label="Cerrar sesión"
              onClick={() =>
                void run(async () => {
                  const r = await supabase!.auth.signOut();
                  if (r.error) throw r.error;
                })
              }
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main>
          <div className="page-title">
            <div>
              <span className="eyebrow">
                CONTROLGPS / {admin ? "ADMINISTRACIÓN" : "MI ASISTENCIA"}
              </span>
              <h1>{!admin && page === "Resumen" ? "Mi jornada" : page}</h1>
              <p>
                {admin
                  ? "Información de tu equipo, respaldada por registros reales."
                  : "Registra tu jornada en el proyecto asignado."}
              </p>
            </div>
            <button
              disabled={busy || loading}
              onClick={() => void run(refresh)}
            >
              <RefreshCw size={16} /> Actualizar
            </button>
          </div>
          {message && (
            <div className="toast" role="alert">
              <span>{message}</span>
              <button aria-label="Cerrar aviso" onClick={() => setMessage("")}>
                ×
              </button>
            </div>
          )}
          {loading ? (
            <div className="card">Cargando información…</div>
          ) : !profile?.active ? (
            <div className="notice">
              Tu cuenta no está activa. Contacta a tu administrador.
            </div>
          ) : (
            <>
              {admin && page === "Resumen" && (
                <>
                  <div className="stats">
                    {[
                      [
                        "Empleados asignados",
                        new Set(
                          assignments
                            .filter(
                              (a) =>
                                a.active &&
                                people.some(
                                  (p) => p.id === a.employee_id && p.active,
                                ) &&
                                projects.some(
                                  (p) => p.id === a.project_id && p.active,
                                ),
                            )
                            .map((a) => a.employee_id),
                        ).size,
                      ],
                      [
                        "Jornadas abiertas",
                        sessions.filter((s) => !s.check_out_at).length,
                      ],
                      [
                        "Dentro de zona",
                        sessions.filter(
                          (s) =>
                            !s.check_out_at && status(s) === "Dentro de zona",
                        ).length,
                      ],
                      [
                        "Fuera de zona",
                        sessions.filter(
                          (s) =>
                            !s.check_out_at && status(s) === "Fuera de zona",
                        ).length,
                      ],
                      [
                        "Sin ubicación reciente",
                        sessions.filter(
                          (s) =>
                            !s.check_out_at &&
                            status(s) === "Sin ubicación reciente",
                        ).length,
                      ],
                      ["Horas registradas hoy", todayHours.toFixed(2)],
                    ].map(([label, value]) => (
                      <div className="card stat" key={label}>
                        <span>{label}</span>
                        <strong>{value}</strong>
                        <small>
                          {label === "Horas registradas hoy"
                            ? "Jornadas finalizadas · tiempo de hoy"
                            : "Datos confirmados por el servidor"}
                        </small>
                      </div>
                    ))}
                  </div>
                  <section className="card">
                    <div className="section-head">
                      <h2>Jornadas en curso</h2>
                      <span className="badge">
                        {sessions.filter((s) => !s.check_out_at).length}{" "}
                        abiertas
                      </span>
                    </div>
                    <AttendanceTable
                      rows={sessions
                        .filter((s) => !s.check_out_at)
                        .map((s) => [
                          employeeName(s.employee_id),
                          projectName(s.project_id),
                          dateGT(s.check_in_at),
                          "—",
                          "—",
                          String(exits(s)),
                          status(s),
                          "",
                        ])}
                    />
                  </section>
                  <div className="notice">{limitation}</div>
                </>
              )}
              {page === "Seguridad" && <SecurityPanel />}
              {admin && page === "Empresa" && company && (
                <CompanySettings company={company} onSaved={refresh} />
              )}
              {admin && page === "Proyectos" && (
                <>
                  <div className="toolbar">
                    <input
                      placeholder="Buscar proyecto…"
                      aria-label="Buscar proyecto"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    <button
                      className="primary"
                      onClick={() => setEditor({ ...blank })}
                    >
                      <Plus size={17} />
                      Nuevo proyecto
                    </button>
                  </div>
                  <div className="project-grid">
                    {projects
                      .filter((p) =>
                        p.name.toLowerCase().includes(search.toLowerCase()),
                      )
                      .map((p) => (
                        <section className="card project-card" key={p.id}>
                          <div className="section-head">
                            <span className="project-icon">
                              <Building2 />
                            </span>
                            <span
                              className={"badge " + (!p.active ? "muted" : "")}
                            >
                              {p.active ? "Activo" : "Archivado"}
                            </span>
                          </div>
                          <h2>{p.name}</h2>
                          <p>{p.address || "Sin dirección"}</p>
                          <p>{p.description}</p>
                          <div className="project-meta">
                            <MapPin size={16} />
                            {p.radius_m} m de radio ·{" "}
                            {
                              assignments.filter(
                                (a) => a.project_id === p.id && a.active,
                              ).length
                            }{" "}
                            asignados
                          </div>
                          <small>
                            {assignments
                              .filter((a) => a.project_id === p.id && a.active)
                              .map((a) => employeeName(a.employee_id))
                              .join(", ") || "Sin empleados asignados"}
                          </small>
                          <div className="actions">
                            <button
                              onClick={() =>
                                setEditor({
                                  ...p,
                                  description: p.description || "",
                                  address: p.address || "",
                                })
                              }
                            >
                              Editar ubicación
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => {
                                if (
                                  confirm(
                                    p.active
                                      ? "¿Archivar este proyecto? Las jornadas abiertas podrán cerrarse."
                                      : "¿Reactivar este proyecto?",
                                  )
                                )
                                  void run(() =>
                                    change("projects", p.id, {
                                      active: !p.active,
                                    }),
                                  );
                              }}
                            >
                              {p.active ? "Archivar" : "Reactivar"}
                            </button>
                          </div>
                        </section>
                      ))}
                  </div>
                  {projects.length === 0 && (
                    <Empty text="Crea tu primer proyecto para definir una zona de trabajo." />
                  )}
                </>
              )}
              {admin && page === "Empleados" && (
                <>
                  <form
                    className="card invite"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      const f = new FormData(form);
                      void run(async () => {
                        const { data, error } =
                          await supabase!.functions.invoke(
                            "controlgps-invite-employee",
                            {
                              body: {
                                email: f.get("email"),
                                full_name: f.get("name"),
                              },
                            },
                          );
                        if (error) {
                          const context = (error as { context?: Response })
                            .context;
                          if (context) {
                            const body = await context.json().catch(() => null);
                            throw Error(
                              body?.message || "No se pudo generar el código.",
                            );
                          }
                          throw error;
                        }
                        form.reset();
                        setInvitationCode(data.code);
                        await refresh();
                        notify(data.message);
                      });
                    }}
                  >
                    <div>
                      <h2>Agregar empleado</h2>
                      <p>
                        Genera un código para una cuenta nueva o existente.
                        Entrégalo al empleado por un canal privado después de
                        comprobar su identidad.
                      </p>
                    </div>
                    <label>
                      Nombre completo
                      <input name="name" required maxLength={200} />
                    </label>
                    <label>
                      Correo de referencia (sin verificación)
                      <input name="email" required type="email" />
                    </label>
                    <button disabled={busy} className="primary">
                      Generar código privado
                    </button>
                  </form>
                  {invitationCode && (
                    <div className="notice">
                      <strong>
                        Código privado — cópialo ahora. No se volverá a mostrar.
                      </strong>
                      <code className="private-code">{invitationCode}</code>
                      <button
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(invitationCode);
                            notify(
                              "Código copiado. Compártelo únicamente con el empleado.",
                            );
                          } catch {
                            notify("Selecciona y copia el código manualmente.");
                          }
                        }}
                      >
                        Copiar código
                      </button>
                      <button onClick={() => setInvitationCode("")}>
                        Ya lo guardé
                      </button>
                      <p>
                        Este código concede acceso a tu empresa. Vence en 7 días
                        y funciona una sola vez. El correo de referencia no
                        determina quién puede canjearlo.
                      </p>
                    </div>
                  )}
                  <InvitationsPanel
                    invitations={invitations}
                    onSaved={refresh}
                  />
                  <div className="card">
                    <h2>Directorio de empleados</h2>
                    {people
                      .filter((p) => p.role === "employee")
                      .map((p) => (
                        <div className="employee" key={p.id}>
                          <div>
                            <strong>{p.full_name}</strong>
                            <small>{p.email}</small>
                            <span className="badge">
                              {p.active ? "Activo" : "Desactivado"}
                            </span>
                          </div>
                          <div className="assignment-list">
                            {projects
                              .filter((pr) => pr.active)
                              .map((pr) => {
                                const a = assignments.find(
                                  (a) =>
                                    a.employee_id === p.id &&
                                    a.project_id === pr.id,
                                );
                                return (
                                  <label className="check" key={pr.id}>
                                    <input
                                      type="checkbox"
                                      disabled={busy || !p.active}
                                      checked={!!a?.active}
                                      onChange={(e) => {
                                        const active = e.target.checked;
                                        void run(async () => {
                                          const r = await supabase!
                                            .from("project_assignments")
                                            .upsert(
                                              {
                                                employee_id: p.id,
                                                project_id: pr.id,
                                                active,
                                              },
                                              {
                                                onConflict:
                                                  "project_id,employee_id",
                                              },
                                            );
                                          if (r.error) throw r.error;
                                          await refresh();
                                          notify("Asignación actualizada.");
                                        });
                                      }}
                                    />
                                    {pr.name}
                                  </label>
                                );
                              })}
                          </div>
                          <button
                            disabled={busy}
                            onClick={() => {
                              if (
                                confirm(
                                  `¿${p.active ? "Desactivar" : "Activar"} acceso de ${p.full_name}?`,
                                )
                              )
                                void run(async () => {
                                  await rpc("set_employee_active", {
                                    p_employee: p.id,
                                    p_active: !p.active,
                                  });
                                  await refresh();
                                });
                            }}
                          >
                            {p.active ? "Desactivar" : "Activar"}
                          </button>
                        </div>
                      ))}
                    {!people.some((p) => p.role === "employee") && (
                      <Empty text="Todavía no hay empleados. Envía la primera invitación." />
                    )}
                  </div>
                </>
              )}
              {!admin && ["Resumen", "Mi jornada"].includes(page) && (
                <>
                  <div className="employee-grid">
                    <section className="card">
                      <div className="section-head">
                        <h2>Tu proyecto</h2>
                        <span className="badge">
                          {open ? "Jornada abierta" : "Sin jornada abierta"}
                        </span>
                      </div>
                      <label>
                        Proyecto asignado
                        <select
                          disabled={!!open}
                          value={open?.project_id || selected}
                          onChange={(e) => {
                            setSelected(e.target.value);
                            setPreview(null);
                          }}
                        >
                          <option value="">Selecciona un proyecto</option>
                          {projects
                            .filter(
                              (p) =>
                                (p.active &&
                                  assignments.some(
                                    (a) =>
                                      a.project_id === p.id &&
                                      a.employee_id === profile.id &&
                                      a.active,
                                  )) ||
                                p.id === open?.project_id,
                            )
                            .map((p) => (
                              <option value={p.id} key={p.id}>
                                {p.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      {activeProject ? (
                        <>
                          <ZoneMap
                            lat={activeProject.latitude}
                            lng={activeProject.longitude}
                            radius={activeProject.radius_m}
                            point={monitor.point || preview}
                          />
                          <h3>{activeProject.name}</h3>
                          <p>{activeProject.address}</p>
                          <div className="project-meta">
                            <MapPin size={16} />
                            Radio permitido: {activeProject.radius_m} metros
                          </div>
                        </>
                      ) : (
                        <Empty text="Selecciona un proyecto. Si no tienes asignaciones, contacta al administrador." />
                      )}
                    </section>
                    <section className="card shift">
                      <span className="project-icon">
                        <Clock />
                      </span>
                      <h2>
                        {open ? "Jornada en curso" : "Listo para comenzar"}
                      </h2>
                      <p>
                        {open
                          ? "Entrada oficial: " + dateGT(open.check_in_at)
                          : "Tu entrada se confirma al verificar el GPS y recibir respuesta del servidor."}
                      </p>
                      <div className="gps-panel">
                        <span className="dot" />
                        <strong>
                          {open
                            ? monitor.status
                            : "GPS pendiente de verificación"}
                        </strong>
                        <small>Permiso: {permission}</small>
                        {(monitor.point || preview) && (
                          <small>
                            Precisión:{" "}
                            {Math.round((monitor.point || preview)!.accuracy)} m{" "}
                            {activeProject &&
                              " · Distancia: " +
                                Math.round(
                                  haversine(
                                    (monitor.point || preview)!,
                                    activeProject,
                                  ),
                                ) +
                                " m"}
                          </small>
                        )}
                      </div>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            if (!navigator.permissions)
                              throw Error(
                                "Consulta el permiso de ubicación en los ajustes del navegador.",
                              );
                            const p = await navigator.permissions.query({
                              name: "geolocation",
                            });
                            setPermission(
                              p.state === "granted"
                                ? "Permitido"
                                : p.state === "denied"
                                  ? "Denegado"
                                  : "Se solicitará al marcar entrada",
                            );
                          })
                        }
                      >
                        Consultar permiso GPS
                      </button>
                      <label className="check consent">
                        <input
                          type="checkbox"
                          checked={consent}
                          onChange={(e) => setConsent(e.target.checked)}
                        />
                        Acepto el monitoreo de ubicación durante mi jornada
                        mientras la página esté activa.
                      </label>
                      {open ? (
                        <>
                          <label>
                            Motivo de salida (obligatorio fuera de zona o sin
                            GPS)
                            <textarea
                              value={reason}
                              onChange={(e) => setReason(e.target.value)}
                              placeholder="Describe el motivo si corresponde"
                            />
                          </label>
                          <button
                            className="primary"
                            disabled={busy}
                            onClick={checkOut}
                          >
                            {busy ? "Registrando…" : "Marcar salida"}
                          </button>
                        </>
                      ) : (
                        <button
                          className="primary"
                          disabled={busy || !activeProject || !consent}
                          onClick={checkIn}
                        >
                          {busy ? "Verificando ubicación…" : "Marcar entrada"}
                        </button>
                      )}
                      <small>Precisión requerida: 50 m o mejor.</small>
                    </section>
                  </div>
                  <div className="notice">{limitation}</div>
                </>
              )}
              {(page === "Asistencias" || page === "Historial") && (
                <>
                  <div className="card">
                    <div className="toolbar filters">
                      {admin && (
                        <label>
                          Empleado
                          <select
                            value={employeeFilter}
                            onChange={(e) => setEmployeeFilter(e.target.value)}
                          >
                            <option value="">Todos</option>
                            {people.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.full_name}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <label>
                        Proyecto
                        <select
                          value={projectFilter}
                          onChange={(e) => setProjectFilter(e.target.value)}
                        >
                          <option value="">Todos</option>
                          {projects.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Desde
                        <input
                          type="date"
                          value={from}
                          onChange={(e) => setFrom(e.target.value)}
                        />
                      </label>
                      <label>
                        Hasta
                        <input
                          type="date"
                          value={to}
                          onChange={(e) => setTo(e.target.value)}
                        />
                      </label>
                      <button
                        onClick={() =>
                          csvDownload([
                            [
                              "Empleado",
                              "Proyecto",
                              "Entrada (Guatemala)",
                              "Salida (Guatemala)",
                              "Horas",
                              "Salidas de zona",
                              "Estado GPS",
                              "Motivo",
                            ],
                            ...reportRows,
                          ])
                        }
                      >
                        <Download size={16} />
                        Exportar CSV
                      </button>
                    </div>
                    <AttendanceTable
                      rows={reportRows}
                      onAdjust={
                        admin ? (i) => setAdjust(filtered[i]) : undefined
                      }
                    />
                    <p className="caption">
                      Horarios de Guatemala · Las jornadas abiertas no cuentan
                      como horas finalizadas. Los filtros usan la fecha de
                      entrada.
                    </p>
                  </div>
                  {admin && (
                    <div className="card">
                      <h2>Eventos de ubicación</h2>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Empleado</th>
                              <th>Proyecto</th>
                              <th>Evento</th>
                              <th>Recepción del servidor</th>
                              <th>Precisión</th>
                            </tr>
                          </thead>
                          <tbody>
                            {events
                              .filter((e) =>
                                filtered.some(
                                  (s) => s.id === e.attendance_session_id,
                                ),
                              )
                              .slice(0, 200)
                              .map((e) => (
                                <tr key={e.id}>
                                  <td>{employeeName(e.employee_id)}</td>
                                  <td>{projectName(e.project_id)}</td>
                                  <td>
                                    {{
                                      inside: "Dentro de zona",
                                      outside: "Fuera de zona",
                                      gps_unavailable: "GPS no disponible",
                                      monitoring_resumed: "Monitoreo reanudado",
                                    }[e.event_type] || e.event_type}
                                  </td>
                                  <td>{dateGT(e.recorded_at)}</td>
                                  <td>
                                    {e.accuracy_m === null
                                      ? "—"
                                      : Math.round(e.accuracy_m) + " m"}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                      <small>
                        Últimos 200 eventos de las jornadas filtradas.
                      </small>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </main>
      </div>
      {editor && (
        <div className="modal-backdrop">
          <form
            className="modal card"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                if (editor.radius_m < 10 || editor.radius_m > 10000)
                  throw Error("El radio debe estar entre 10 y 10000 m.");
                const { id, ...values } = editor;
                const r = id
                  ? await supabase!.from("projects").update(values).eq("id", id)
                  : await supabase!
                      .from("projects")
                      .insert({ ...values, created_by: profile!.id });
                if (r.error) throw r.error;
                setEditor(null);
                await refresh();
                notify("Proyecto guardado.");
              });
            }}
          >
            <div className="section-head">
              <h2>{editor.id ? "Editar proyecto" : "Nuevo proyecto"}</h2>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setEditor(null)}
              >
                ×
              </button>
            </div>
            <label>
              Nombre
              <input
                required
                value={editor.name}
                onChange={(e) => setEditor({ ...editor, name: e.target.value })}
              />
            </label>
            <label>
              Descripción
              <textarea
                value={editor.description}
                onChange={(e) =>
                  setEditor({ ...editor, description: e.target.value })
                }
              />
            </label>
            <label>
              Dirección de referencia
              <input
                value={editor.address}
                onChange={(e) =>
                  setEditor({ ...editor, address: e.target.value })
                }
              />
            </label>
            <p>
              Coloca el pin haciendo clic en el mapa o escribe las coordenadas
              exactas.
            </p>
            <ZoneMap
              lat={editor.latitude}
              lng={editor.longitude}
              radius={editor.radius_m}
              onPick={(latitude, longitude) =>
                setEditor({ ...editor, latitude, longitude })
              }
            />
            <div className="form-grid">
              <label>
                Latitud
                <input
                  required
                  type="number"
                  min="-90"
                  max="90"
                  step="any"
                  value={editor.latitude}
                  onChange={(e) =>
                    setEditor({ ...editor, latitude: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Longitud
                <input
                  required
                  type="number"
                  min="-180"
                  max="180"
                  step="any"
                  value={editor.longitude}
                  onChange={(e) =>
                    setEditor({ ...editor, longitude: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Radio (m)
                <input
                  required
                  type="number"
                  min="10"
                  max="10000"
                  step="1"
                  value={editor.radius_m}
                  onChange={(e) =>
                    setEditor({ ...editor, radius_m: Number(e.target.value) })
                  }
                />
              </label>
            </div>
            <button className="primary" disabled={busy}>
              Guardar proyecto
            </button>
          </form>
        </div>
      )}
      {adjust && (
        <div className="modal-backdrop">
          <form
            className="modal card"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                const out = String(f.get("out"));
                await rpc("adjust_attendance", {
                  p_session: adjust.id,
                  p_in: new Date(String(f.get("in")) + "-06:00").toISOString(),
                  p_out: out ? new Date(out + "-06:00").toISOString() : null,
                  p_reason: f.get("reason"),
                });
                setAdjust(null);
                await refresh();
                notify("Ajuste guardado con auditoría.");
              });
            }}
          >
            <div className="section-head">
              <h2>Ajustar asistencia</h2>
              <button
                type="button"
                onClick={() => setAdjust(null)}
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>
            <p>
              Hora de Guatemala. El cambio conservará los valores anteriores y
              tu identidad.
            </p>
            <label>
              Entrada
              <input
                name="in"
                type="datetime-local"
                required
                defaultValue={localInput(adjust.check_in_at)}
              />
            </label>
            <label>
              Salida (vacío para jornada abierta)
              <input
                name="out"
                type="datetime-local"
                defaultValue={
                  adjust.check_out_at ? localInput(adjust.check_out_at) : ""
                }
              />
            </label>
            <label>
              Motivo obligatorio
              <textarea name="reason" required minLength={5} />
            </label>
            <button disabled={busy} className="primary">
              Guardar ajuste auditado
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
function localInput(v: string) {
  return new Date(new Date(v).getTime() - 6 * 3600000)
    .toISOString()
    .slice(0, 16);
}
function Brand() {
  return (
    <div className="brand">
      <span>
        <MapPin size={25} />
      </span>
      <div>
        Control<span>GPS</span>
        <small>ASISTENCIA POR PROYECTO</small>
      </div>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <MapPin size={30} />
      <p>{text}</p>
    </div>
  );
}
function AttendanceTable({
  rows,
  onAdjust,
}: {
  rows: string[][];
  onAdjust?: (index: number) => void;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {[
              "Empleado",
              "Proyecto",
              "Entrada",
              "Salida",
              "Horas",
              "Alertas",
              "Estado",
              "Motivo",
            ].map((h) => (
              <th key={h}>{h}</th>
            ))}
            {onAdjust && <th>Ajustes</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((v, j) => (
                <td key={j}>
                  {j === 6 ? (
                    <span
                      className={
                        "badge " +
                        (v === "Fuera de zona"
                          ? "danger"
                          : v.includes("Sin")
                            ? "muted"
                            : "")
                      }
                    >
                      {v}
                    </span>
                  ) : (
                    v
                  )}
                </td>
              ))}
              {onAdjust && (
                <td>
                  <button onClick={() => onAdjust(i)}>Corregir</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <Empty text="No hay registros para mostrar." />}
    </div>
  );
}
