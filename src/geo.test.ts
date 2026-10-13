import { describe, it, expect } from "vitest";
import {
  haversine,
  validateLocation,
  nextZone,
  gpsStatus,
  STALE_MS,
} from "./geo";
const center = { latitude: 0, longitude: 0 };
const point = (distance = 0, accuracy = 10) => ({
  latitude: ((distance / 6371000) * 180) / Math.PI,
  longitude: 0,
  accuracy,
  timestamp: Date.now(),
});
describe("Haversine y validación", () => {
  it("distancia cero", () => expect(haversine(center, center)).toBe(0));
  it("un grado en el ecuador", () =>
    expect(haversine(center, { latitude: 0, longitude: 1 })).toBeCloseTo(
      111194.9266,
      3,
    ));
  it("antípodas y polos", () => {
    expect(haversine(center, { latitude: 0, longitude: 180 })).toBeCloseTo(
      Math.PI * 6371000,
    );
    expect(
      haversine(
        { latitude: 90, longitude: 0 },
        { latitude: 90, longitude: 180 },
      ),
    ).toBeLessThan(0.001);
  });
  it("cruce del meridiano 180", () =>
    expect(
      haversine(
        { latitude: 0, longitude: 179.999 },
        { latitude: 0, longitude: -179.999 },
      ),
    ).toBeCloseTo(222.3899, 3));
  it("radio y límite incluido", () => {
    expect(() => validateLocation(point(100), center, 100)).not.toThrow();
    expect(() => validateLocation(point(100.1), center, 100)).toThrow("fuera");
    for (const r of [0, 9, 10001, 10.5, NaN])
      expect(() => validateLocation(point(), center, r)).toThrow("radio");
  });
  it("precisión insuficiente y coordenadas inválidas", () => {
    for (const a of [51, NaN, -1])
      expect(() => validateLocation(point(0, a), center, 100)).toThrow(
        "Precisión",
      );
    expect(() =>
      validateLocation({ ...point(), latitude: 91 }, center, 100),
    ).toThrow("Coordenadas");
  });
  it("rechaza lectura obsoleta", () =>
    expect(() =>
      validateLocation(
        { ...point(), timestamp: Date.now() - 31000 },
        center,
        100,
      ),
    ).toThrow("reciente"));
});
describe("Monitoreo", () => {
  it("dos lecturas consecutivas con histéresis", () => {
    const first = nextZone(116, 10, 100, 0, "inside");
    expect(first.zone).toBe("inside");
    expect(nextZone(116, 10, 100, first.count, first.zone).zone).toBe(
      "outside",
    );
    expect(nextZone(110, 10, 100, 1, "inside").count).toBe(0);
  });
  it("precisión mala interrumpe consecutivas", () =>
    expect(nextZone(200, 60, 100, 1, "inside")).toEqual({
      count: 0,
      zone: "inside",
      verified: false,
    }));
  it("retorno dentro de zona", () =>
    expect(nextZone(90, 10, 100, 2, "outside").zone).toBe("inside"));
  it("GPS reciente y obsoleto", () => {
    const now = Date.now();
    expect(gpsStatus("inside", new Date(now).toISOString(), now)).toBe(
      "Dentro de zona",
    );
    expect(gpsStatus("outside", new Date(now).toISOString(), now)).toBe(
      "Fuera de zona",
    );
    expect(
      gpsStatus("inside", new Date(now - STALE_MS - 1).toISOString(), now),
    ).toBe("Sin ubicación reciente");
    expect(gpsStatus("gps_unavailable", new Date(now).toISOString(), now)).toBe(
      "Sin ubicación reciente",
    );
  });
});
