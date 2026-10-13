import { test, expect } from "@playwright/test";
import { harness, login, setGPS } from "./support";
test("ocultar pestaña detiene GPS sin cerrar la jornada y reanuda al volver", async ({
  page,
}) => {
  const h = await harness(page);
  try {
    await login(page);
    await page.getByLabel("Proyecto asignado").selectOption(h.projectId);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Marcar entrada" }).click();
    await expect(page.locator(".gps-panel")).toContainText("Dentro de zona");
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(page.locator(".gps-panel")).toContainText(
      "Ubicación sin verificar",
    );
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { testGPS: { watchers: Map<number, unknown> } })
            .testGPS.watchers.size,
      ),
    ).toBe(0);
    expect(
      (
        await h.db.query(
          "select * from controlgps.attendance_sessions where check_out_at is null",
        )
      ).rows,
    ).toHaveLength(1);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: false,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(page.locator(".gps-panel")).toContainText("Dentro de zona");
  } finally {
    await h.db.close();
  }
});
test("fallo de tiles muestra aviso y no impide la validación GPS", async ({
  page,
}) => {
  const h = await harness(page);
  try {
    await page.route("https://*.tile.openstreetmap.org/**", (route) =>
      route.abort(),
    );
    await login(page);
    await page.getByLabel("Proyecto asignado").selectOption(h.projectId);
    await expect(
      page.getByText("No se pudieron cargar los mapas.", { exact: false }),
    ).toBeVisible();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Marcar entrada" }).click();
    await expect(page.locator(".toast")).toContainText("Entrada registrada");
  } finally {
    await h.db.close();
  }
});
test("registro, confirmación de contraseña y mensaje de correo", async ({
  page,
}) => {
  const h = await harness(page, "new");
  try {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Crear cuenta", exact: true })
      .first()
      .click();
    await page
      .getByLabel("Nombre de tu empresa")
      .fill("Constructora de prueba");
    await page.getByLabel("Tu nombre completo").fill("Persona de prueba");
    await page.getByLabel("Correo electrónico").fill("prueba@example.com");
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill("MiContraseña123!");
    await page.getByLabel("Confirmar contraseña").fill("NoCoincide123!");
    await page.locator(".login-form button.primary").click();
    await expect(page.getByRole("alert")).toContainText("no coinciden");
    await page.getByLabel("Confirmar contraseña").fill("MiContraseña123!");
    await page.locator(".login-form button.primary").click();
    await expect(page.getByRole("alert")).toContainText("Revisa tu correo");
    expect(
      (await h.db.query("select * from controlgps.companies")).rows,
    ).toHaveLength(0);
  } finally {
    await h.db.close();
  }
});
test("cuenta verificada crea empresa mediante el backend y ve su panel", async ({
  page,
}) => {
  const h = await harness(page, "new");
  try {
    await login(page);
    await expect(
      page.getByRole("heading", { name: "Tu espacio de trabajo" }),
    ).toBeVisible();
    await page
      .getByLabel("Nombre de la empresa")
      .fill("Nueva empresa real de prueba");
    await page.getByLabel("Tu nombre completo").fill("Dueño de prueba");
    await page.getByRole("button", { name: "Crear mi empresa" }).click();
    await expect(
      page.getByRole("heading", { name: "Resumen", exact: true }),
    ).toBeVisible();
    await expect(page.locator("header")).toContainText(
      "Nueva empresa real de prueba",
    );
    expect(
      (await h.db.query("select * from controlgps.companies")).rows,
    ).toHaveLength(1);
  } finally {
    await h.db.close();
  }
});
test("GPS denegado, timeout, precisión mala y fuera de zona no crean asistencia", async ({
  page,
}) => {
  const h = await harness(page);
  try {
    await login(page);
    await page.getByLabel("Proyecto asignado").selectOption(h.projectId);
    await page.getByRole("checkbox").check();
    for (const [gps, expected] of [
      [
        { latitude: 0, longitude: 0, accuracy: 10, failure: 1 },
        "Permiso de ubicación denegado",
      ],
      [
        { latitude: 0, longitude: 0, accuracy: 10, failure: 3 },
        "Se agotó el tiempo",
      ],
      [
        { latitude: 0, longitude: 0, accuracy: 60, failure: 0 },
        "Precisión insuficiente",
      ],
      [
        { latitude: 0.01, longitude: 0, accuracy: 10, failure: 0 },
        "fuera de la zona",
      ],
    ] as const) {
      await setGPS(page, gps);
      await page.getByRole("button", { name: "Marcar entrada" }).click();
      await expect(page.getByRole("alert")).toContainText(expected);
      expect(
        (await h.db.query("select * from controlgps.attendance_sessions")).rows,
      ).toHaveLength(0);
    }
  } finally {
    await h.db.close();
  }
});
test("entrada y monitoreo: dos lecturas exteriores, retorno, GPS obsoleto y checkout sin GPS", async ({
  page,
}) => {
  const h = await harness(page);
  try {
    await login(page);
    await page.getByLabel("Proyecto asignado").selectOption(h.projectId);
    expect(
      await page.evaluate(
        () =>
          (
            window as unknown as {
              testGPS: { calls: number; watchers: Map<number, unknown> };
            }
          ).testGPS.calls,
      ),
    ).toBe(0);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Marcar entrada" }).click();
    await expect(page.getByRole("alert")).toContainText("Entrada registrada");
    await expect(page.locator(".gps-panel")).toContainText("Dentro de zona");
    const options = await page.evaluate(
      () =>
        (window as unknown as { testGPS: { options: PositionOptions[] } })
          .testGPS.options[0],
    );
    expect(options).toEqual({
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15000,
    });
    await page.waitForTimeout(5200);
    await setGPS(page, {
      latitude: 0.002,
      longitude: 0,
      accuracy: 10,
      failure: 0,
    });
    await expect(page.locator(".gps-panel")).toContainText("Dentro de zona");
    await page.waitForTimeout(5200);
    await setGPS(page, {
      latitude: 0.002,
      longitude: 0,
      accuracy: 10,
      failure: 0,
    });
    await expect(page.locator(".gps-panel")).toContainText("Fuera de zona");
    expect(
      (
        await h.db.query(
          "select * from controlgps.attendance_sessions where check_out_at is null",
        )
      ).rows,
    ).toHaveLength(1);
    await page.waitForTimeout(5200);
    await setGPS(page, { latitude: 0, longitude: 0, accuracy: 10, failure: 0 });
    await expect(page.locator(".gps-panel")).toContainText("Dentro de zona");
    await page.clock.install();
    await page.clock.fastForward(125000);
    await expect(page.locator(".gps-panel")).toContainText(
      "Ubicación sin verificar",
    );
    await setGPS(page, { latitude: 0, longitude: 0, accuracy: 10, failure: 2 });
    await page.getByLabel("Motivo de salida").fill("Fin de jornada sin GPS");
    await page.getByRole("button", { name: "Marcar salida" }).click();
    await expect(page.getByRole("alert")).toContainText("Salida registrada");
    const closed = await h.db.query<{
      check_out_at: string;
      check_out_latitude: number | null;
    }>(
      "select check_out_at,check_out_latitude from controlgps.attendance_sessions",
    );
    expect(closed.rows[0].check_out_at).toBeTruthy();
    expect(closed.rows[0].check_out_latitude).toBeNull();
  } finally {
    await h.db.close();
  }
});
test("pérdida de red no muestra entrada registrada", async ({ page }) => {
  const h = await harness(page);
  try {
    await login(page);
    await page.getByLabel("Proyecto asignado").selectOption(h.projectId);
    await page.getByRole("checkbox").check();
    h.setOffline(true);
    await page.getByRole("button", { name: "Marcar entrada" }).click();
    await expect(page.getByRole("alert")).toContainText("Sin conexión");
    expect(
      (await h.db.query("select * from controlgps.attendance_sessions")).rows,
    ).toHaveLength(0);
  } finally {
    await h.db.close();
  }
});
test("mapa administrativo coloca pin y cambia radio en pantalla móvil", async ({
  page,
}) => {
  const h = await harness(page, "admin");
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    await page.getByRole("button", { name: "Proyectos", exact: true }).click();
    await page.getByRole("button", { name: "Nuevo proyecto" }).click();
    const lat = page.getByLabel("Latitud");
    const before = await lat.inputValue();
    await page
      .locator(".modal .leaflet-container")
      .click({ position: { x: 90, y: 90 } });
    expect(await lat.inputValue()).not.toBe(before);
    await page.getByLabel("Radio (m)").fill("250");
    await page.getByLabel("Nombre", { exact: true }).fill("Obra móvil");
    await page.getByRole("button", { name: "Guardar proyecto" }).click();
    await expect(
      page.getByRole("heading", { name: "Obra móvil" }),
    ).toBeVisible();
    await expect(page.getByText("250 m de radio")).toBeVisible();
  } finally {
    await h.db.close();
  }
});
