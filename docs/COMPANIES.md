# Empezar con ControlGPS

## Dueño o administrador

1. **Crear cuenta**: nombre, empresa, correo y contraseña de 12+ caracteres.
2. Abrir el correo de confirmación e iniciar sesión. Una cuenta existente de Supabase puede usar su contraseña actual.
3. **Crear mi empresa**: confirmar nombre y nombre del administrador. La empresa se crea en el servidor junto con el perfil administrador.
4. **Empresa**: editar nombre. **Proyectos**: crear pin y radio. **Empleados**: invitar personas.
5. Esperar a que cada empleado acepte la invitación y asignarle sus proyectos.
6. Revisar **Resumen** y **Asistencias**, filtrar reportes, exportar CSV o corregir horarios con motivo auditado.

## Empleado

1. Usar el mismo correo de la invitación; abrir el enlace, establecer contraseña cuando corresponda e iniciar sesión.
2. **Aceptar invitación** para ingresar a la empresa. Las invitaciones vencen a los 7 días; el administrador puede renovarlas.
3. Seleccionar proyecto, aceptar monitoreo y **Marcar entrada**. Se exige GPS dentro del radio y precisión de 50 m o mejor.
4. Mantener la web activa. Fuera de zona se registra una alerta; no se cierra la jornada.
5. **Marcar salida**. Fuera de zona o sin GPS, indicar motivo.

Una cuenta pertenece a una empresa en este MVP. Para otra empresa usa otra cuenta. Las empresas tienen datos separados; el registro no permite entrar a una empresa ajena. Las contraseñas del Supabase compartido también afectan Business Helper.

## Publicación y pruebas

Vercel requiere las cuatro variables de `.env.example`, ambas migraciones, esquema expuesto y función de invitación. El dominio definitivo debe aparecer en Redirect URLs (welcome=1 y confirmed=1) y CONTROLGPS_APP_ORIGINS. No agregar wildcards de dominios ajenos.

Antes de operar: validar SMTP con correos reales y probar GPS de Android/iOS en HTTPS. Un navegador no garantiza GPS con teléfono bloqueado o pestaña cerrada. Las pruebas automatizadas usan lecturas controladas, no sensores físicos.
