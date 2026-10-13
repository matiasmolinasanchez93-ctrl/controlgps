# ControlGPS — Gestión de Asistencia por Proyecto

Aplicación React/Vite/TypeScript/Tailwind, Supabase Auth/PostgreSQL y Leaflet/OpenStreetMap para equipos en Guatemala. Sin datos ficticios. Roles derivados de `profiles`, horas oficiales del servidor y zona `America/Guatemala` (24 horas).

## Estado y bloqueadores

Conectado al proyecto Supabase existente **buisness helper** (`jxejohnwplnmxdzzkhen`). La migración está aplicada en el esquema separado `controlgps`, la API está expuesta y la función `controlgps-invite-employee` está desplegada. El administrador es `matias.molinasanchez93@gmail.com`, con su cuenta y contraseña actuales. `.env` contiene únicamente configuración pública y está ignorado por Git.

Las 15 tablas públicas originales y el trigger `public.handle_new_user` se conservaron. ControlGPS usa perfiles y permisos propios. Los usuarios y contraseñas de Auth se comparten: cambiar una contraseña o recuperar una cuenta afecta su acceso a ambas aplicaciones. Un usuario nuevo de ControlGPS también pasa por el trigger original de Business Helper; los usuarios creados desde Business Helper no se agregan automáticamente a ControlGPS.

Verificados TypeScript, compilación, pruebas de PostgreSQL embebido, acceso del rol administrador en la base alojada y rechazo de acceso anónimo por Data API. **Pendientes:** login interactivo con contraseña del usuario, correo SMTP/redirects, GPS físico, verificación visual en navegador y Vercel. Antes de usar con empleados, completa la lista de aceptación. La web corre localmente; no se ha publicado en Vercel.

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
2. La migración inicial ya fue aplicada al proyecto conectado; **no vuelvas a ejecutarla allí ni uses db reset**. En un proyecto nuevo, ejecuta `supabase/migrations/202610130001_controlgps.sql` como propietario. Crea únicamente el esquema `controlgps` y un trigger de nombre independiente, sin cambiar tablas ni funciones públicas.
3. Los usuarios no pueden elegir su rol: el trigger crea `employee` solo para invitaciones marcadas `controlgps_enrolled:true`. No cambies el registro público ni las políticas globales de Auth sin considerar Business Helper. Una cuenta registrada públicamente no recibe privilegios de ControlGPS.
4. En Authentication → URL Configuration, **conserva Site URL y las URLs existentes de Business Helper**. Añade a Redirect URLs `http://localhost:5173/?welcome=1`, `http://127.0.0.1:5173/?welcome=1` y, cuando esté disponible, `https://TU-DOMINIO/?welcome=1`. Esta configuración de redirects sigue pendiente de revisión; es necesaria para que invitación y recuperación regresen a ControlGPS.
5. Configura SMTP para invitaciones y recuperación. Verifica remitente, límites y entrega. No consideres una respuesta del API garantía de recepción del correo.

Exposición de API: el proyecto conectado ya expone `controlgps` mediante una configuración del rol `authenticator` que conserva `public,graphql_public`. En otro proyecto añade `controlgps` a Data API → Exposed schemas **conservando todos los esquemas existentes**, o revisa `scripts/expose-controlgps.sql` antes de ejecutarlo (su fallback asume los esquemas estándar). [Esquemas personalizados](https://supabase.com/docs/guides/api/using-custom-schemas). La migración fue ejecutada con `supabase db query --linked --file ...`; no registra automáticamente historial de migraciones. Para futuras migraciones, concilia el historial del proyecto antes de utilizar db push.

### Crear el primer administrador de forma segura

La cuenta indicada ya está habilitada como admin de ControlGPS. En otro entorno, usa una cuenta existente o crea un usuario desde Authentication → Users y copia su UUID verificado. Ejecuta únicamente desde SQL Editor del propietario:

```sql
insert into controlgps.profiles(id, full_name, email, role)
select id, coalesce(nullif(raw_user_meta_data->>'full_name',''),split_part(email,'@',1)), email, 'admin'
from auth.users where id = 'UUID-VERIFICADO-DEL-USUARIO'::uuid
on conflict(id) do update set role='admin', active=true;
select id, email, full_name, role, active
from controlgps.profiles
where id = 'UUID-VERIFICADO-DEL-USUARIO'::uuid;
```

Comprueba que el correo y UUID corresponden al administrador. No existe endpoint público de bootstrap ni selección de rol desde el cliente. No pongas credenciales administrativas en archivos del repositorio. Guarda el acceso al dashboard de Supabase con MFA.

### Invitaciones de empleados

Despliega el endpoint Deno protegido:

```powershell
supabase secrets set CONTROLGPS_APP_ORIGINS=https://TU-DOMINIO
supabase functions deploy controlgps-invite-employee
```

Supabase proporciona a la función `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`. Esta última **solo se utiliza en la función**, nunca en Vite/Vercel frontend. `CONTROLGPS_APP_ORIGINS` acepta orígenes separados por coma, sin barra final. Actualmente permite `http://localhost:5173,http://127.0.0.1:5173`. Al publicar, configura la URL definitiva y revisa los redirects de Auth. El nombre del secreto es específico de ControlGPS para evitar conflictos con otras funciones.

En PowerShell, encierra entre comillas el argumento cuando contiene comas: `supabase secrets set 'CONTROLGPS_APP_ORIGINS=http://localhost:5173,http://127.0.0.1:5173'`.

`verify_jwt=false` es intencional para compatibilidad con claves modernas: el endpoint verifica manualmente el token mediante `auth.getUser(token)`, exige un perfil admin activo y comprueba el origen. No acepta peticiones sin autenticación. No utiliza el rol de metadatos del usuario. [API oficial de invitación](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail).

En Empleados, introduce nombre y correo → Enviar invitación. El perfil aparece tras confirmar la creación del usuario en Auth. El empleado abre el correo y establece su contraseña. Usa las casillas del directorio para asignar/desasignar proyectos. Desactivar acceso bloquea lecturas de registros y acciones aunque el token siga vigente; conserva el historial. Si tiene una jornada abierta al desactivarlo, el administrador debe cerrarla mediante ajuste auditado.

Si el correo ya existe en Supabase, utiliza **Agregar cuenta existente**. La función `controlgps.enroll_employee` exige admin activo, agrega un perfil de empleado en ControlGPS y no altera su contraseña ni su perfil en Business Helper. Una invitación nueva no puede reemplazar una cuenta existente. Para que Business Helper conserve su funcionamiento, no uses el panel de Auth para borrar/desactivar usuarios compartidos: usa Desactivar en el directorio de ControlGPS.

## Comportamiento y seguridad

- RLS en todas las tablas. Solo el administrador administra proyectos/asignaciones. Empleados ven su perfil, sus asignaciones y registros; proyectos asignados y proyectos de su historial para poder identificar jornadas archivadas. No se permiten escrituras directas sobre asistencias, eventos ni perfiles.
- `check_in` deriva empleado de `auth.uid()`, exige cuenta activa, proyecto activo, asignación activa, coordenadas válidas, precisión ≤50 m y distancia ≤radio. Valida lectura reportada ≤30 s. Advisory lock e índice parcial único impiden dos jornadas abiertas. Las horas se generan en la base de datos.
- El empleado debe aceptar el monitoreo antes de entrada. Entrada solicita `enableHighAccuracy`, `maximumAge:0`, `timeout:15000`. No registra éxito antes de respuesta del servidor. Un error de red se muestra y exige revisar/actualizar antes de reintentar.
- `record_location` vuelve a calcular distancia en el servidor. Dos lecturas válidas consecutivas fuera de radio+15 m producen salida de zona. Una lectura dentro del radio registra retorno. Una interrupción/mala precisión rompe la secuencia; mediciones repetidas se ignoran. Se guardan hora reportada y hora de recepción. Las muestras exteriores periódicas sirven como heartbeat cada ≥30 s, y el reporte cuenta transiciones, no heartbeats.
- No se obtienen coordenadas fuera de jornada salvo el intento de entrada iniciado por empleado. La edición administrativa del mapa no solicita GPS. Consultar permisos no lee ubicación.
- La salida manual permite estar fuera del radio; exige motivo de ≥5 caracteres fuera de zona o sin GPS. La salida sin GPS registra coordenadas nulas. Nunca cierra la jornada automáticamente por una pérdida de seguimiento.
- Cambiar de pestaña detiene el watch y marca falta de verificación; regresar lo reinicia con consentimiento vigente. Una jornada recuperada al recargar requiere aceptar otra vez el monitoreo. Datos antiguos o eventos de indisponibilidad se muestran sin ubicación reciente.
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
npm audit
```

Las pruebas SQL ejecutan la migración real en PGlite con roles `anon`/`authenticated` y un `auth.uid()` de prueba. Verifican RLS, rechazo anónimo, no asignado, GPS malo, radio inválido, fuera de zona, entrada duplicada, dos muestras exteriores, retorno, salida exterior y auditoría. No sustituyen una ejecución de aceptación en Supabase; en particular no simulan procesos PostgreSQL concurrentes independientes, el gateway Edge, SMTP, OAuth ni teléfonos físicos. Consulta `docs/ACCEPTANCE.md`.

## Organización

- `src/App.tsx`: autenticación, administración, jornada, reportes y ajustes.
- `src/Map.tsx`: Leaflet y radio interactivo.
- `src/useMonitor.ts`: consentimiento, watchPosition y visibilidad.
- `src/geo.ts`: Haversine, validación y estado GPS.
- `src/lib.ts`, `src/types.ts`: cliente, formatos/CSV y tipos.
- `supabase/migrations/`: esquema, índices, RLS y RPC seguras.
- `supabase/functions/controlgps-invite-employee/`: invitaciones verificadas en servidor.
- `docs/ACCEPTANCE.md`: validación manual obligatoria antes de operación.

Las invitaciones y RLS siguen los flujos documentados por [Supabase Auth](https://supabase.com/docs/guides/auth/users) y [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
