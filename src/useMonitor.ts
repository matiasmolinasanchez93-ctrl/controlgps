import { useEffect, useState } from "react";
import { supabase } from "./lib";
import { ACCURACY, STALE_MS, locationError, type Point } from "./geo";
export function useMonitor(
  sessionId: string | undefined,
  consent: boolean,
  onError: (message: string) => void,
) {
  const [point, setPoint] = useState<Point | null>(null),
    [status, setStatus] = useState("Ubicación sin verificar");
  useEffect(() => {
    setPoint(null);
    setStatus("Ubicación sin verificar");
    if (!sessionId || !consent || !supabase) return;
    const db = supabase;
    let watch: number | undefined,
      alive = true,
      last = 0,
      busy = false,
      lastSent = 0;
    const signal = async (value: string) => {
      const { error } = await db.rpc("record_location", {
        p_session: sessionId,
        p_signal: value,
      });
      if (error && alive) onError(error.message);
    };
    const stop = () => {
      if (watch !== undefined) navigator.geolocation.clearWatch(watch);
      watch = undefined;
      setStatus("Ubicación sin verificar");
    };
    const start = () => {
      if (document.hidden) return;
      void signal("monitoring_resumed");
      if (!navigator.geolocation) {
        onError("Este navegador no admite GPS.");
        return;
      }
      watch = navigator.geolocation.watchPosition(
        async (p) => {
          if (!alive) return;
          const v = {
            latitude: p.coords.latitude,
            longitude: p.coords.longitude,
            accuracy: p.coords.accuracy,
            timestamp: p.timestamp,
          };
          setPoint(v);
          if (v.accuracy > ACCURACY || Date.now() - v.timestamp > 30000) {
            last = 0;
            setStatus("Ubicación sin verificar · precisión insuficiente");
            void signal("gps_unavailable");
            return;
          }
          if (busy || Date.now() - lastSent < 5000) return;
          busy = true;
          lastSent = Date.now();
          const { data, error } = await db.rpc("record_location", {
            p_session: sessionId,
            p_lat: v.latitude,
            p_lng: v.longitude,
            p_accuracy: v.accuracy,
            p_measured: new Date(v.timestamp).toISOString(),
          });
          busy = false;
          if (!alive) return;
          if (error) {
            last = 0;
            setStatus("Ubicación sin verificar");
            onError(error.message);
          } else {
            last = Date.now();
            setStatus(data === "outside" ? "Fuera de zona" : "Dentro de zona");
          }
        },
        (e) => {
          last = 0;
          setStatus("Ubicación sin verificar");
          onError(locationError(e.code));
          void signal("gps_unavailable");
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
      );
    };
    const visible = () => {
      stop();
      if (document.hidden) {
        last = 0;
        void signal("gps_unavailable");
      } else start();
    };
    start();
    document.addEventListener("visibilitychange", visible);
    const timer = setInterval(() => {
      if (!last || Date.now() - last > STALE_MS)
        setStatus("Ubicación sin verificar");
    }, 5000);
    return () => {
      alive = false;
      stop();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [sessionId, consent, onError]);
  return { point, status };
}
