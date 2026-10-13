# ControlGPS — Asistencia por empresa y proyecto

React, Vite, TypeScript, Tailwind, Supabase Auth/PostgreSQL y Leaflet/OpenStreetMap. Interfaz española, horarios oficiales del servidor y formatos de Guatemala en 24 horas. Webapp instalable (PWA), con registro inmediato, invitaciones por código privado y recuperación sin correo.

## Usar la aplicación

Producción: **https://controlgps-cyan.vercel.app**. GitHub: https://github.com/matiasmolinasanchez93-ctrl/controlgps.

1. **Crear cuenta** con un correo disponible y contraseña fuerte de 12+ caracteres. No se envía confirmación. El correo es un identificador, no una identidad verificada.
2. En **Tu espacio de trabajo**, crea tu empresa o introduce el código privado entregado por el administrador. Una cuenta pertenece a una empresa en este MVP.
3. En **Seguridad**, confirma tu contraseña y genera una clave personal de recuperación. Guarda el archivo descargado en un lugar privado, fuera de la app. Solo se muestra una vez.
4. Administrador: crea proyectos/pines/radios, genera códigos de empleados, espera su ingreso y asígnalos a proyectos. El administrador comprueba la identidad del empleado antes de entregarle su código por un canal privado.
5. Empleado: selecciona proyecto, acepta monitoreo y registra entrada dentro del radio. La salida manual admite estar fuera de zona o sin GPS, con motivo.

**Instalar webapp** muestra el diálogo del navegador o instrucciones. Android: Chrome → Instalar aplicación/Agregar a pantalla de inicio. iPhone/iPad: Safari → Compartir → Agregar a pantalla de inicio. Escritorio: botón de instalación del navegador. Se abre en una ventana propia; instalar no habilita GPS en segundo plano.

## Códigos y protección de cuentas

- Invitaciones `CG-…`: aleatorias (122 bits efectivos), 7 días, un uso, revocables. Generar otro código para una invitación pendiente invalida el anterior. Se muestran solo al emitirlas y se guardan únicamente hashes en una tabla privada.
- El código determina la autorización; el correo de referencia del administrador no basta para entrar y no debe considerarse prueba de identidad. El empleado puede usar otro correo disponible para su cuenta. Quien recibe el código puede canjearlo: entregarlo solo a la persona correcta.
- Las invitaciones antiguas basadas en correo se revocaron al aplicar la tercera migración. Los endpoints antiguos de aceptación por UUID/correo ya no son ejecutables por usuarios. No se envían invitaciones por correo.
- Máximo 8 intentos por cuenta cada 15 minutos para canjear códigos; los fallos mantienen el contador. El código largo hace impracticable adivinarlo, incluso creando cuentas distintas.
- Claves personales `RC-…`: aleatorias (244 bits efectivos), hashes privados, generadas con autenticación reciente por contraseña. Otra clave invalida la anterior. Sirven para recuperar una cuenta sin SMTP y se consumen después del cambio de contraseña.
- **Olvidé mi contraseña** requiere correo identificador, clave personal y nueva contraseña fuerte. Solo la función protegida de recuperación puede verificar/reservar la clave y cambiar la contraseña mediante service_role. Limita intentos, maneja reservas simultáneas y no acepta el correo como prueba.
- Recuperar bloquea sesiones previas en RLS por la fecha de creación de su sesión de Auth; renovar el JWT de una sesión vieja no evita el bloqueo. También se revocan refresh tokens globales de Auth. Después debes iniciar sesión y generar otra clave personal.
- Sin contraseña, clave ni sesión abierta, solo el propietario del servicio puede asistir tras verificar identidad por un canal independiente. No existe un botón que otorgue una recuperación solo por declarar un correo. Nunca compartas tu clave de recuperación con un administrador de empresa.

## Entorno conectado y efecto en Business Helper

Supabase **buisness helper**, ref `jxejohnwplnmxdzzkhen`, esquema `controlgps`. Las **tres migraciones** están aplicadas; las funciones `controlgps-invite-employee` y `controlgps-recover-account` están desplegadas. El equipo previo se conserva en **Mi empresa**, administrado por `matias.molinasanchez93@gmail.com`.

Las tablas públicas y el trigger de Business Helper se conservan. Auth es compartido: **la confirmación de correo se deshabilitó globalmente y los nuevos cambios de contraseña exigen 12 caracteres, mayúsculas, minúsculas, números y símbolos**. Esto también aplica a Business Helper. Cambiar/recuperar contraseña y revocar sesiones globales afecta ambas aplicaciones. La Site URL original permanece y se conservan sus redirects.

ControlGPS no demuestra propiedad del correo, legitimidad jurídica de una empresa ni presencia física infalsificable. El acceso a datos se protege mediante contraseña, código secreto, roles y empresa. Para políticas de Auth diferentes entre productos, utiliza proyectos Supabase separados. Cuentas antiguas pendientes de confirmación que aún no pueden ingresar requieren asistencia del propietario; no se confirma ni modifica en masa a usuarios de Business Helper.

## Local y variables

Node.js 22.12+ (recomendado 24):

```powershell
npm ci
# Solo si no existe .env:
Copy-Item .env.example .env
# Completa los valores públicos
npm run dev
```

| Variable               | Valor                                              |
| ---------------------- | -------------------------------------------------- |
| VITE_SUPABASE_URL      | URL HTTPS del proyecto                             |
| VITE_SUPABASE_ANON_KEY | Clave pública anon/publishable, nunca service_role |
| VITE_SUPABASE_SCHEMA   | controlgps                                         |
| VITE_GPS_STALE_MS      | 120000 por defecto                                 |

VITE es público e incorporado al build. `.env`, `.env.local`, `.vercel/` y credenciales no van a GitHub ni al paquete de despliegue. Sin configuración no se simulan registros.

## Otro Supabase y despliegue

1. Ejecuta las migraciones 001, 002 y 003 de `supabase/migrations/` en orden. Son no idempotentes. **No repetir en el proyecto conectado ni usar db reset.**
2. Expón `controlgps` en Data API conservando los esquemas existentes. Revisa `scripts/expose-controlgps.sql` antes de usarlo; su fallback asume public y graphql_public.
3. Activa email/password, permite registro, desactiva confirmación de correo y establece la política de contraseña del archivo config. Conserva los ajustes de otros productos. No sincronices una configuración incompleta: la CLI puede aplicar valores predeterminados a servicios compartidos.
4. Inicia sesión y crea empresa desde la app. No otorgues roles a partir de metadatos ni insertes perfiles sin empresa.
5. Despliega ambas funciones y configura los orígenes exactos, sin barra final ni wildcards ajenos:

```powershell
supabase secrets set 'CONTROLGPS_APP_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,https://TU-DOMINIO'
supabase functions deploy controlgps-invite-employee
supabase functions deploy controlgps-recover-account
```

Supabase proporciona las claves del servidor. `verify_jwt=false` en recuperación permite usar el código cuando se perdió la contraseña: no concede acceso sin una clave válida. Invitaciones verifican el token con `auth.getUser()` y la RPC exige admin activo de su propia empresa. La recuperación usa service_role exclusivamente en el servidor. No necesita Resend ni SMTP.

Vercel: proyecto `streak6/controlgps`, Vite, build `npm run build`, output `dist`. Las cuatro variables públicas se configuran en Production y Preview. `vercel.json` configura SPA, manifiesto y servicio worker. `.vercelignore` excluye credenciales y artefactos de prueba. Al cambiar dominio, actualiza CONTROLGPS_APP_ORIGINS. Los previews no autorizados pueden cargar interfaz pero no llamar a las funciones protegidas por origen.

```powershell
npx vercel link --yes --project controlgps --scope streak6
npx vercel --prod --yes --scope streak6
```

Las migraciones alojadas se aplicaron con db query; concilia el historial antes de usar db push para cambios futuros.

## GPS, datos y offline

RLS y llaves compuestas mantienen perfiles, proyectos, asignaciones, jornadas, eventos y ajustes dentro de su empresa. Las RPC con privilegios también filtran empresa. Empleados no escriben directamente asistencias ni pueden usar IDs ajenos. Correcciones del admin guardan antes/después, autor, motivo y fecha.

Entrada: GPS fresco con alta precisión, sin caché, timeout 15 s; precisión ≤50 m, lectura ≤30 s, distancia Haversine ≤radio, cuenta/proyecto/asignación activos. Lock e índice parcial impiden duplicados. Tiempos oficiales son del servidor.

Monitoreo solo en jornada abierta y con consentimiento. Dos muestras fiables consecutivas fuera de radio+15 m producen salida de zona. Mala precisión/interrupción rompe secuencia; retorno registra dentro. La salida de zona no cierra la jornada. Al volver a pestaña se reinicia el watch; al recargar se pide consentimiento. GPS obsoleto se muestra sin verificar, no dentro/fuera.

PWA cachea **solo interfaz y recursos estáticos del mismo origen**. Nunca cachea Auth/Supabase, registros, peticiones de asistencia ni tiles. Sin conexión puede abrir la interfaz; un aviso explica que no se pueden confirmar operaciones. No hay asistencia optimista ni cola de entradas/salidas offline. Reconectar y consultar estado antes de reenviar una petición cuyo resultado se desconoce.

**Teléfono bloqueado, pestaña cerrada y navegador suspendido pueden detener GPS.** Instalar la PWA no elimina esa limitación. Coordenadas y hora de medición son evidencia reportada por el dispositivo, alterable; recepción y horarios oficiales sí son del servidor. En teléfono usa HTTPS, no una IP LAN HTTP.

Radio por defecto 100 m (10–10000), precisión 50 m, histéresis 15 m, caducidad 120 s. Mapas con OpenStreetMap sujetos a [su política](https://operations.osmfoundation.org/policies/tiles/); si fallan, aparece aviso y GPS/edición por coordenadas siguen siendo independientes.

Reportes en Guatemala, filtros por fecha de entrada, incompletos sin horas finales y CSV UTF-8 con BOM/protección contra fórmulas. Estadísticas de datos reales; no hay registros de demostración.

## Pruebas

```powershell
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm audit
```

PGlite prueba las migraciones base y las reglas finales de códigos, recuperación, RLS, geofencing y sesiones. Chromium usa un adaptador HTTP conectado a SQL y GPS controlado: registro inmediato, código, seguridad, PWA y flujo de asistencia. GitHub Actions ejecuta esas pruebas sin credenciales reales.

`scripts/live-codes-smoke.mjs` ejecuta, solo con autorización del propietario, registro/invitación/recuperación reales en el Supabase conectado y limpia sus cuentas temporales. Usa identificadores reservados @invalid.example, no envía correo ni imprime contraseñas/códigos. Si cleanup falla, revisa los IDs indicados y `scripts/smoke-cleanup.sql`; no declares que se eliminaron sin comprobarlo. No ejecutar este script en CI. La clave no se guarda en archivos.

Pendiente de aceptación física: instalación iOS/Android, sensores GPS reales, bloqueo del teléfono y concurrencia PostgreSQL desde procesos independientes. Sigue `docs/ACCEPTANCE.md`. Este MVP no incluye facturación ni múltiples empresas por cuenta; para gran volumen dimensiona Supabase y revisa límites de tiles.
