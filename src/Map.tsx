import { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Circle,
  CircleMarker,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
function Controls({
  lat,
  lng,
  onPick,
}: {
  lat: number;
  lng: number;
  onPick?: (lat: number, lng: number) => void;
}) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom());
    map.invalidateSize();
  }, [lat, lng, map]);
  useMapEvents({ click: (e) => onPick?.(e.latlng.lat, e.latlng.lng) });
  return null;
}
export default function ZoneMap({
  lat,
  lng,
  radius,
  onPick,
  point,
}: {
  lat: number;
  lng: number;
  radius: number;
  onPick?: (lat: number, lng: number) => void;
  point?: { latitude: number; longitude: number; accuracy: number } | null;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="map-wrap">
      <MapContainer
        center={[lat, lng]}
        zoom={16}
        scrollWheelZoom={false}
        style={{ height: 300, width: "100%" }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          eventHandlers={{ tileerror: () => setFailed(true) }}
        />
        <Circle
          center={[lat, lng]}
          radius={Number.isFinite(radius) && radius > 0 ? radius : 100}
          pathOptions={{ color: "#059669", fillOpacity: 0.13 }}
        />
        <CircleMarker
          center={[lat, lng]}
          radius={7}
          pathOptions={{ color: "#fff", fillColor: "#059669", fillOpacity: 1 }}
        />
        <Controls lat={lat} lng={lng} onPick={onPick} />
        {point &&
          Number.isFinite(point.latitude) &&
          Number.isFinite(point.longitude) && (
            <>
              <CircleMarker
                center={[point.latitude, point.longitude]}
                radius={6}
                pathOptions={{
                  color: "#fff",
                  fillColor: "#2563eb",
                  fillOpacity: 1,
                }}
              >
                <Tooltip>
                  Tu última lectura GPS · precisión {Math.round(point.accuracy)}{" "}
                  m
                </Tooltip>
              </CircleMarker>
              {Number.isFinite(point.accuracy) && point.accuracy <= 500 && (
                <Circle
                  center={[point.latitude, point.longitude]}
                  radius={point.accuracy}
                  pathOptions={{
                    color: "#2563eb",
                    fillOpacity: 0.05,
                    weight: 1,
                  }}
                />
              )}
            </>
          )}
      </MapContainer>
      {failed && (
        <p role="alert">
          No se pudieron cargar los mapas. Puedes introducir las coordenadas
          manualmente.
        </p>
      )}
    </div>
  );
}
