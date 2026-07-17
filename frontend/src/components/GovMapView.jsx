import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const markerIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

export default function GovMapView({ items = [], onSelect }) {
  // fallback center = Bengaluru
  const center = [12.9716, 77.5946];

  const first = items.find(
    (x) => typeof x.lat === "number" && typeof x.lon === "number"
  );

  const mapCenter = first ? [first.lat, first.lon] : center;

  return (
    <div className="w-full h-[520px] rounded-3xl overflow-hidden border">
      <MapContainer center={mapCenter} zoom={12} scrollWheelZoom={true}>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {items
          .filter((x) => typeof x.lat === "number" && typeof x.lon === "number")
          .map((c) => (
            <Marker
              key={c.id}
              position={[c.lat, c.lon]}
              icon={markerIcon}
              eventHandlers={{
                click: () => {
                  if (onSelect) onSelect(c.id);
                },
              }}
            >
              <Popup>
                <div className="text-sm">
                  <div className="font-extrabold">{c.category}</div>
                  <div className="text-gray-600">
                    {c.locality || "N/A"} • {c.priority || "Low"}
                  </div>
                  <button
                    className="mt-2 px-3 py-1 rounded-xl bg-[#2f8f7a] text-white font-bold"
                    onClick={() => onSelect && onSelect(c.id)}
                  >
                    Open
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
      </MapContainer>
    </div>
  );
}
