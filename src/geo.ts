export type Point = {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
};
export const STALE_MS = Number(import.meta.env.VITE_GPS_STALE_MS) || 120000;
export const ACCURACY = 50;
export const HYSTERESIS = 15;
export function haversine(
  a: Pick<Point, "latitude" | "longitude">,
  b: Pick<Point, "latitude" | "longitude">,
) {
  const rad = (n: number) => (n * Math.PI) / 180;
  const x =
    Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
      Math.cos(rad(b.latitude)) *
      Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return (
    6371000 *
    2 *
    Math.atan2(Math.sqrt(Math.min(1, x)), Math.sqrt(Math.max(0, 1 - x)))
  );
}
export function validateLocation(
  p: Point,
  center: Pick<Point, "latitude" | "longitude">,
  radius: number,
) {
  if (!Number.isInteger(radius) || radius < 10 || radius > 10000)
    throw Error("El radio debe estar entre 10 y 10000 metros.");
  if (
    !Number.isFinite(p.latitude) ||
    Math.abs(p.latitude) > 90 ||
    !Number.isFinite(p.longitude) ||
    Math.abs(p.longitude) > 180
  )
    throw Error("Coordenadas inválidas.");
  if (!Number.isFinite(p.accuracy) || p.accuracy < 0 || p.accuracy > ACCURACY)
    throw Error(
      "Precisión insuficiente. Necesitas una precisión de 50 m o mejor.",
    );
  if (Date.now() - p.timestamp > 30000 || p.timestamp > Date.now() + 5000)
    throw Error("La lectura GPS no es reciente. Intenta de nuevo.");
  if (haversine(p, center) > radius)
    throw Error("Estás fuera de la zona permitida.");
}
export function nextZone(
  distance: number,
  accuracy: number,
  radius: number,
  count: number,
  previous: "inside" | "outside",
) {
  if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > ACCURACY)
    return { count: 0, zone: previous, verified: false };
  if (distance > radius + HYSTERESIS)
    return {
      count: count + 1,
      zone: count + 1 >= 2 ? ("outside" as const) : previous,
      verified: true,
    };
  return {
    count: 0,
    zone: distance <= radius ? ("inside" as const) : previous,
    verified: true,
  };
}
export function gpsStatus(type?: string, at?: string, now = Date.now()) {
  if (
    !at ||
    now - new Date(at).getTime() > STALE_MS ||
    !["inside", "outside"].includes(type || "")
  )
    return "Sin ubicación reciente";
  return type === "inside" ? "Dentro de zona" : "Fuera de zona";
}
export function freshLocation(): Promise<Point> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation)
      return reject(Error("Este navegador no admite GPS."));
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          accuracy: p.coords.accuracy,
          timestamp: p.timestamp,
        }),
      (e) => reject(Error(locationError(e.code))),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  });
}
export const locationError = (code: number) =>
  code === 1
    ? "Permiso de ubicación denegado. Actívalo en los ajustes del navegador."
    : code === 3
      ? "Se agotó el tiempo de GPS. Acércate a un lugar abierto e intenta de nuevo."
      : "GPS no disponible. Revisa la ubicación de tu dispositivo.";
