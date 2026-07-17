import { MapContainer, TileLayer, Marker, useMapEvents, Circle } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const markerIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(a));
}

function ClickHandler({ locked, onChange, centerLat, centerLon, radiusMeters }) {
  useMapEvents({
    click(e) {
      if (locked) return;
      const d = haversineMeters(centerLat, centerLon, e.latlng.lat, e.latlng.lng);
      if (d > radiusMeters) return;
      onChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function MapPicker({
  lat,
  lon,
  locked = true,
  onChange,
  centerLat,
  centerLon,
  radiusMeters = 1000,
}) {
  if (lat == null || lon == null) {
    return (
      <div className="h-[320px] rounded-2xl border bg-white flex items-center justify-center text-gray-500">
        Loading map...
      </div>
    );
  }

  const cLat = centerLat ?? lat;
  const cLon = centerLon ?? lon;

  return (
    <MapContainer center={[lat, lon]} zoom={14} scrollWheelZoom={true}>
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Allowed radius */}
      <Circle
        center={[cLat, cLon]}
        radius={radiusMeters}
        pathOptions={{ color: "#10b981" }}
      />

      <ClickHandler
        locked={locked}
        onChange={onChange}
        centerLat={cLat}
        centerLon={cLon}
        radiusMeters={radiusMeters}
      />

      <Marker
        position={[lat, lon]}
        icon={markerIcon}
        draggable={!locked}
        eventHandlers={{
          dragend: (e) => {
            if (locked) return;
            const p = e.target.getLatLng();
            const d = haversineMeters(cLat, cLon, p.lat, p.lng);
            if (d > radiusMeters) {
              // snap back
              e.target.setLatLng([lat, lon]);
              return;
            }
            onChange(p.lat, p.lng);
          },
        }}
      />
    </MapContainer>
  );
}
