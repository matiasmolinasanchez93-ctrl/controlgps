# Lista de aceptación manual — entorno real

Estado inicial: **pendiente**. Usar dos cuentas de empleado, una de administrador y un teléfono con GPS, bajo HTTPS. No introducir registros de prueba en producción como si fueran jornadas reales. Registrar fecha, navegador, usuario de prueba y resultado de cada caso. La ubicación falsa en herramientas de desarrollo sirve para verificar reglas, no para probar GPS físico.

- [ ] Ejecutar la migración en Supabase sin errores; confirmar RLS en las siete tablas, índice `one_open_shift` y permisos de funciones. Conservar la configuración de registro de Business Helper. Verificar que registros públicos no reciben asignaciones ni roles admin en ControlGPS.
- [ ] Crear el usuario administrador desde el dashboard; habilitar solo el UUID verificado en controlgps.profiles mediante SQL; ingresar y comprobar navegación administrativa.
- [ ] Crear usuario con metadatos `role:admin` en entorno de prueba y verificar que su perfil sigue siendo employee. El cliente no puede actualizar su rol.
- [ ] Crear proyecto con pin en mapa, radio 100, nombre y dirección. Mover pin y ajustar radio; el círculo cambia. Guardar, recargar y verificar coordenadas persistidas. Probar radios 9 y 10001: rechazados por base de datos.
- [ ] Editar y archivar proyecto. Empleado no puede iniciar allí; historial se conserva. Reactivarlo.
- [ ] Invitar empleado con SMTP real. Confirmar correo y link; establecer contraseña de 12+ caracteres; salir y volver a ingresar con ella. Intentar invitación como empleado/sin token: 403/401, sin crear usuario.
- [ ] Asignar empleado al proyecto, recargar y comprobar que solo ve proyectos autorizados. Desasignar y comprobar que la entrada es denegada por el servidor.
- [ ] Con segundo empleado, consultar perfiles/asistencias/eventos del primero usando API: datos inaccesibles. Intentar insertar o actualizar asistencia directa: denegado.
- [ ] Dentro del radio, aceptar monitoreo y Marcar entrada. Probar permiso denegado antes de permitirlo. No debe existir registro al denegar. Permitir GPS; confirmar precisión ≤50 m, hora del servidor y jornada abierta.
- [ ] Fuera del radio, intentar entrada: rechazo explícito sin registro. Con precisión >50 m o lectura >30 s, rechazo. Probar timeout/GPS apagado: error visible, sin éxito ficticio.
- [ ] Desde dos pestañas/celulares del mismo empleado, enviar entrada simultánea. Solo una jornada abierta; segunda petición rechazada. Confirmar el índice y el lock bajo concurrencia real.
- [ ] Con jornada abierta, salir a más de radio+15 m. Una lectura no genera salida; dos lecturas fiables consecutivas generan fuera de zona. Mala precisión intermedia rompe secuencia. Verificar recepción/medición, no checkout. Muestras posteriores no inflan conteo de salidas; volver dentro registra retorno.
- [ ] Poner navegador en segundo plano, bloquear teléfono y cerrar pestaña en ensayos separados. No prometer seguimiento. Verificar estado sin ubicación reciente y que jornada permanece abierta. Volver a página y confirmar reanudación. Tras recargar, aceptar de nuevo monitoreo.
- [ ] Interrumpir red: se muestra error, nunca éxito anticipado. Restaurar, Actualizar y comprobar el estado confirmado antes de reenviar.
- [ ] Marcar salida dentro de zona, verificar hora del servidor y duración. Segundo checkout rechazado. En otra jornada, marcar salida fuera de zona con motivo: permitido; sin motivo: rechazado. Desactivar GPS y salir con motivo: permitido con coordenadas nulas.
- [ ] Admin ve tarjetas de empleados asignados, abiertas, dentro/fuera/sin GPS y horas de jornadas cerradas correspondientes a hoy. GPS obsoleto nunca aparece dentro de zona.
- [ ] Filtrar reportes por empleado, proyecto y fechas. Verificar horarios de Guatemala, jornadas incompletas, horas y alertas de salida. Exportar CSV, abrirlo en Excel y verificar acentos/columnas. Nombre que empiece con `=` no se ejecuta como fórmula.
- [ ] Corregir entrada/salida con motivo; verificar before/after, UUID de admin y timestamp en `attendance_adjustments`. Motivo vacío, salida anterior a entrada y cambios como empleado: denegados. Reabrir registro con otra jornada abierta: rechazado.
- [ ] Desactivar empleado: no puede realizar RPC ni leer registros de asistencia, incluso con token previo. Se conserva historial; admin puede cerrar una jornada pendiente con ajuste.
- [ ] Recuperar contraseña mediante correo, abrir enlace HTTPS, cambiarla e ingresar otra vez.
- [ ] Bloquear servidor de tiles: aviso visible; mapa degradado, edición por coordenadas y validación GPS independientes.
- [ ] Revisar teléfono Android/iOS real y escritorio: navegación, formularios, lectura de mapa, teclados, foco, contraste, doble toque, errores y actualización.
- [ ] Vercel muestra deploy exitoso, URL HTTPS accesible; configurar esa URL en Supabase y CONTROLGPS_APP_ORIGINS y repetir login/invitación/GPS antes de habilitar empleados.

No se han marcado estos casos como realizados: necesitan credenciales, correo y dispositivos reales.
