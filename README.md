# ControlGPS — Gestión de Asistencia por Proyecto

Aplicación React/Vite/TypeScript/Tailwind, Supabase Auth/PostgreSQL y Leaflet/OpenStreetMap para equipos en Guatemala. Sin datos ficticios. Roles derivados de `profiles`, horas oficiales del servidor y zona `America/Guatemala` (24 horas).

## Estado y bloqueadores

Conectado al proyecto Supabase existente **buisness helper** (`jxejohnwplnmxdzzkhen`). Ambas migraciones están aplicadas en el esquema separado `controlgps`, la API está expuesta y la función `controlgps-invite-employee` está desplegada. El equipo anterior se conserva en **Mi empresa**, editable por su administrador `matias.molinasanchez93@gmail.com`. `.env` y `.env.local` están ignorados por Git y excluidos del despliegue.

Las 15 tablas públicas originales y el trigger `public.handle_new_user` se conservaron. ControlGPS usa perfiles y permisos propios. Los usuarios y contraseñas de Auth se comparten: cambiar una contraseña o recuperar una cuenta afecta su acceso a ambas aplicaciones. Un usuario nuevo de ControlGPS también pasa por el trigger original de Business Helper; los usuarios creados desde Business Helper no se agregan automáticamente a ControlGPS.

Registro de cuentas, creación de empresas, invitaciones aceptadas por el empleado y aislamiento de datos por empresa. Consulta `docs/COMPANIES.md` para empezar. Proyecto Vercel: `streak6/controlgps`, dominio de producción `https://controlgps-cyan.vercel.app`.

Verificados TypeScript, compilación, PostgreSQL embebido, Chromium con GPS controlado y una transacción en Supabase real con rollback completo. **Pendientes de aceptación física:** entrega real de correo, GPS Android/iOS y bloqueo del teléfono. Los redirects de confirmación/invitación y el origen de producción están configurados. Antes de usar con empleados, completa la lista de aceptación.

## Requisitos y ejecución

Node.js 22.12+ y npm. Una cuenta Supabase y una cuenta Vercel. No se requiere una API pagada para GPS, mapas o asistencia. El correo de producción requiere configurar un proveedor SMTP; comprueba sus límites y políticas.

```powershell
npm ci
# Solo si .env no existe: copiar .env.example y completar los valores
npm run dev
```

Variables de Vite (públicas, incorporadas en el build):

| Variable               | Valor                                                        |
| ---------------------- | ------------------------------------------------------------ |
| VITE_SUPABASE_URL      | URL HTTPS del proyecto Supabase                              |
| VITE_SUPABASE_ANON_KEY | Clave pública anon o publishable, nunca service_role         |
| VITE_SUPABASE_SCHEMA   | controlgps                                                   |
| VITE_GPS_STALE_MS      | Tiempo de caducidad del estado GPS; predeterminado 120000 ms |

No uses valores de ejemplo en producción. Cambiar variables en Vercel requiere un nuevo build. La pantalla inicial muestra instrucciones si falta la configuración.

## Base de datos y Auth

1. La carpeta ya está vinculada a **buisness helper**. Para otro proyecto: `supabase link --project-ref TU_REF`.
2. Las migraciones `202610130001_controlgps.sql` y `202610130002_companies.sql` ya están aplicadas; **no repitas ni uses db reset**. En otro proyecto ejecútalas en ese orden. La segunda preserva los datos previos en una empresa; en un proyecto vacío, las empresas se crean desde la app.
3. Activa email/password, permite registro y exige confirmación de correo. Los metadatos no conceden roles ni membresías. `create_company` asigna admin únicamente a su propia empresa; `accept_invitation` crea empleados únicamente mediante invitaciones privadas verificadas por correo.
4. Conserva Site URL y redirects de Business Helper. Añade `/?welcome=1` y `/?confirmed=1` para los orígenes de ControlGPS. El proyecto conectado incluye localhost:5173, 127.0.0.1:5173 y controlgps-cyan.vercel.app. `supabase/config.toml` conserva la Site URL original `https://mindforgecpa.vercel.app` y exige confirmación. No sincronices una configuración incompleta: la CLI puede aplicar valores predeterminados a servicios compartidos.
5. Configura SMTP de producción para aceptar cualquier destinatario, confirma remitente y límites. El servicio de correo predeterminado de Supabase tiene restricciones. No se han suministrado credenciales de SMTP externo; valida entrega y spam con una cuenta real. Una respuesta del API no garantiza entrega.

Exposición de API: el proyecto conectado ya expone `controlgps` mediante una configuración del rol `authenticator` que conserva `public,graphql_public`. En otro proyecto añade `controlgps` a Data API → Exposed schemas **conservando todos los esquemas existentes**, o revisa `scripts/expose-controlgps.sql` antes de ejecutarlo (su fallback asume los esquemas estándar). [Esquemas personalizados](https://supabase.com/docs/guides/api/using-custom-schemas). La migración fue ejecutada con `supabase db query --linked --file ...`; no registra automáticamente historial de migraciones. Para futuras migraciones, concilia el historial del proyecto antes de utilizar db push.

### Crear el primer administrador de forma segura

La cuenta indicada ya administra el equipo conservado. Para una empresa nueva, usa **Crear cuenta**, confirma el correo e inicia sesión. En **Tu espacio de trabajo** pulsa **Crear mi empresa**. El servidor asigna el rol admin con identidad autenticada y en una transacción; no hace falta promover usuarios mediante SQL.

Una cuenta pertenece a una empresa en este MVP. Para otra empresa utiliza otra cuenta. No se permite mover cuentas ni historial entre empresas. Una cuenta desactivada tampoco puede crear otra empresa para evadir controles. Protege el acceso al dashboard de Supabase con MFA.

### Invitaciones de empleados

Despliega el endpoint Deno protegido:

```powershell
supabase secrets set CONTROLGPS_APP_ORIGINS=https://TU-DOMINIO
supabase functions deploy controlgps-invite-employee
```

Supabase proporciona a la función `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`. Esta última **solo se utiliza en la función**, nunca en Vite/Vercel frontend. `CONTROLGPS_APP_ORIGINS` acepta orígenes separados por coma, sin barra final. Actualmente permite `http://localhost:5173,http://127.0.0.1:5173,https://controlgps-cyan.vercel.app`. El nombre del secreto es específico de ControlGPS para evitar conflictos con otras funciones.

En PowerShell, encierra entre comillas el argumento cuando contiene comas: `supabase secrets set 'CONTROLGPS_APP_ORIGINS=http://localhost:5173,http://127.0.0.1:5173'`.

`verify_jwt=false` es intencional para compatibilidad con claves modernas: el endpoint verifica manualmente el token mediante `auth.getUser(token)`, exige un perfil admin activo y comprueba el origen. No acepta peticiones sin autenticación. No utiliza el rol de metadatos del usuario. [API oficial de invitación](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail).

En Empleados, introduce nombre y correo → Enviar invitación. Se crea una invitación privada de 7 días. El empleado abre el correo, establece contraseña, inicia sesión y **acepta la invitación**; entonces aparece en el directorio. Puedes revocar o renovar invitaciones pendientes. Si falla el correo, se muestra el fallo y la invitación queda pendiente para reintentar. Asigna proyectos mediante las casillas del directorio. Desactivar bloquea acceso y conserva historial; el administrador puede cerrar jornadas pendientes con ajuste auditado.

Para un correo existente utiliza **Agregar cuenta existente** y comparte el enlace de acceso. La función crea una invitación, sin asignación automática ni cambio de contraseña. El empleado debe aceptarla. Si la función de correo detecta una cuenta existente, informa que hay invitación disponible y que no envió un correo nuevo. Una cuenta de otra empresa no puede ser capturada. No borres/desactives Auth de usuarios compartidos: usa Desactivar en ControlGPS.

## Comportamiento y seguridad

- RLS en todas las tablas, incluido empresas e invitaciones. `company_id` obligatorio y llaves compuestas impiden cruces entre empresas. Cada administrador gestiona únicamente su empresa; también las RPC con privilegios elevados filtran su empresa. Empleados ven solo sus propios registros y proyectos autorizados. No se permiten escrituras directas sobre asistencias, eventos ni perfiles.
- `check_in` deriva empleado de `auth.uid()`, exige cuenta activa, proyecto activo, asignación activa, coordenadas válidas, precisión ≤50 m y distancia ≤radio. Valida lectura reportada ≤30 s. Advisory lock e índice parcial único impiden dos jornadas abiertas. Las horas se generan en la base de datos.
- El empleado debe aceptar el monitoreo antes de entrada. Entrada solicita `enableHighAccuracy`, `maximumAge:0`, `timeout:15000`. No registra éxito antes de respuesta del servidor. Un error de red se muestra y exige revisar/actualizar antes de reintentar.
- `record_location` vuelve a calcular distancia en el servidor. Dos lecturas válidas consecutivas fuera de radio+15 m producen salida de zona. Una lectura dentro del radio registra retorno. Una interrupción/mala precisión rompe la secuencia; mediciones repetidas se ignoran. Se guardan hora reportada y hora de recepción. Las muestras exteriores periódicas sirven como heartbeat cada ≥30 s, y el reporte cuenta transiciones, no heartbeats.
- No se obtienen coordenadas fuera de jornada salvo el intento de entrada iniciado por empleado. La edición administrativa del mapa no solicita GPS. Consultar permisos no lee ubicación.
- La salida manual permite estar fuera del radio; exige motivo de ≥5 caracteres fuera de zona o sin GPS. La salida sin GPS registra coordenadas nulas. Nunca cierra la jornada automáticamente por una pérdida de seguimiento.
- Cambiar de pestaña detiene el watch; regresar reinicia inmediatamente la lectura con consentimiento vigente. Respuestas pendientes del watch anterior no restauran estados obsoletos. Al recargar se acepta nuevamente el monitoreo. Datos antiguos o eventos de indisponibilidad se muestran sin ubicación reciente. El mapa muestra la última lectura del empleado y su precisión, sin iniciar lecturas por sí mismo.
- Correcciones desde Asistencias → Corregir exigen admin activo y motivo. La función guarda antes/después, autor y fecha en `attendance_adjustments`, sin permitir al cliente modificar la auditoría. Valores de fecha en el formulario corresponden a Guatemala.
- Los reportes filtran por fecha de entrada en Guatemala; jornadas abiertas no tienen duración final. La tarjeta de horas de hoy incluye solo la parte de jornadas finalizadas que coincide con hoy. CSV UTF-8 con BOM y comillas, compatible con Excel y protegido contra fórmulas.
- Deshabilitar/archivar no elimina historial. No hay borrado de empleados/proyectos en el cliente.
- El diseño usa estados reales, sin registros de demostración. Las consultas se refrescan cada 30 s y mediante Actualizar; no requieren Realtime.

**Límite de navegador:** no hay seguimiento fiable con teléfono bloqueado, pestaña cerrada ni navegador suspendido. No es una aplicación nativa. Falta de GPS no prueba estar dentro ni fuera. Las coordenadas y horas de medición son reportadas por el dispositivo y pueden falsificarse. La recepción y horarios de asistencia sí son del servidor. No se promete detección antifraude.

Predeterminados: radio 100 m, radio válido 10–10000 m, precisión máxima 50 m, histéresis 15 m, caducidad 120 s. Radio configurable por proyecto. Para cambiar precisión/histéresis, modifica las constantes y sus valores equivalentes en migración/funcción SQL y actualiza las pruebas. El umbral de interrupción de secuencia del backend es 120 s.

## Vercel

1. Sube esta carpeta a un repositorio e impórtalo en Vercel, framework Vite. Build `npm run build`, output `dist`.
2. Añade las cuatro variables públicas de `.env.example` y despliega. No agregues la clave de servicio al frontend.
3. Conserva Site URL de Business Helper; agrega la URL final de ControlGPS a Redirect URLs y `CONTROLGPS_APP_ORIGINS`, despliega la función y vuelve a probar invitaciones.
4. Comprueba login, GPS móvil y lista de aceptación. Localhost permite GPS para desarrollo; en teléfono usa la URL HTTPS real (un acceso por IP LAN HTTP normalmente no permite geolocalización).

`vercel.json` configura fallback SPA y permiso de geolocalización para el propio origen. Los mapas descargan tiles públicos de OpenStreetMap: requieren red y cumplir [su política de uso](https://operations.osmfoundation.org/policies/tiles/). Sin tiles, las coordenadas y geofencing siguen siendo independientes del mapa; aparece un aviso y el administrador puede ingresar coordenadas manualmente. La dirección se guarda como referencia; la ubicación exacta se elige en mapa o coordenadas, sin geocodificador externo.

## Verificación

```powershell
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm audit
```

SQL/PGlite ejecuta ambas migraciones con roles reales y verifica geofencing, RLS, horarios, aislamiento entre empresas e invitaciones. Chromium usa un adaptador HTTP conectado a esa base y GPS controlado, sin producción ni envío de correo. Verifica registro, empresa, permisos/timeout, mala precisión, fuera de zona, monitoreo/retorno, stale GPS, checkout sin GPS, visibilidad, mapas móviles y tiles fallidos. GitHub Actions ejecuta esas pruebas, TypeScript y build sin credenciales reales.

`scripts/verify-tenancy-live.sql` también verifica empresas, invitación aceptada, entrada, salida de zona, checkout exterior y aislamiento en el Supabase alojado; todo se revierte al terminar. Las comprobaciones no sustituyen SMTP, GPS físico ni concurrencia PostgreSQL de procesos independientes. Consulta `docs/ACCEPTANCE.md`.

## Organización

- `src/App.tsx`: autenticación, administración, jornada, reportes y ajustes.
- `src/AuthPanel.tsx`, `src/Onboarding.tsx`: registro, creación de empresa y aceptación.
- `src/CompanySettings.tsx`, `src/InvitationsPanel.tsx`: empresa e invitaciones.
- `src/Map.tsx`: Leaflet y radio interactivo.
- `src/useMonitor.ts`: consentimiento, watchPosition y visibilidad.
- `src/geo.ts`: Haversine, validación y estado GPS.
- `src/lib.ts`, `src/types.ts`: cliente, formatos/CSV y tipos.
- `supabase/migrations/`: esquema, índices, RLS y RPC seguras.
- `supabase/functions/controlgps-invite-employee/`: invitaciones verificadas en servidor.
- `docs/ACCEPTANCE.md`: validación manual obligatoria antes de operación.
- `e2e/`, `.github/workflows/ci.yml`: pruebas de navegador y verificación continua.

Las invitaciones y RLS siguen los flujos documentados por [Supabase Auth](https://supabase.com/docs/guides/auth/users) y [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
