import { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Circle,
  CircleMarker,
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
}: {
  lat: number;
  lng: number;
  radius: number;
  onPick?: (lat: number, lng: number) => void;
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
