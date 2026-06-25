import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default icon URLs (not used directly but suppresses warnings)
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export type MapPin = {
  id: string;
  lat: number;
  lng: number;
  severity: "critical" | "moderate" | "minor";
  title?: string;
  subtitle?: string;
  body?: React.ReactNode;
};

export type RouteLine = {
  id: string;
  coords: [number, number][];
  color: string;
  weight?: number;
  opacity?: number;
  dashed?: boolean;
};

function makeIcon(severity: "critical" | "moderate" | "minor") {
  return L.divIcon({
    className: "",
    html: `<div class="pin-marker ${severity}"></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

function userIcon() {
  return L.divIcon({
    className: "",
    html: `<div class="user-marker"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function destIcon() {
  return L.divIcon({
    className: "",
    html: `<div class="dest-marker">★</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function ClickHandler({ onPick }: { onPick?: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick?.(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function FlyTo({ center }: { center?: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, Math.max(map.getZoom(), 15), { duration: 0.6 });
  }, [center, map]);
  return null;
}

export default function MapInner({
  center = [6.5244, 3.3792], // Lagos default
  zoom = 12,
  pins = [],
  onPick,
  pickedMarker,
  flyTo,
  height = "100%",
  userPos,
  destination,
  routes = [],
}: {
  center?: [number, number];
  zoom?: number;
  pins?: MapPin[];
  onPick?: (lat: number, lng: number) => void;
  pickedMarker?: { lat: number; lng: number } | null;
  flyTo?: [number, number] | null;
  height?: string | number;
  userPos?: { lat: number; lng: number } | null;
  destination?: { lat: number; lng: number } | null;
  routes?: RouteLine[];
}) {
  const ref = useRef<L.Map | null>(null);

  return (
    <MapContainer
      ref={ref}
      center={center}
      zoom={zoom}
      style={{ height, width: "100%", borderRadius: 12 }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      {onPick && <ClickHandler onPick={onPick} />}
      {flyTo && <FlyTo center={flyTo} />}
      {pickedMarker && (
        <Marker position={[pickedMarker.lat, pickedMarker.lng]} icon={makeIcon("critical")} />
      )}
      {userPos && (
        <>
          <Circle center={[userPos.lat, userPos.lng]} radius={80} pathOptions={{ color: "#3FE0A8", fillColor: "#3FE0A8", fillOpacity: 0.15, weight: 1 }} />
          <Marker position={[userPos.lat, userPos.lng]} icon={userIcon()} />
        </>
      )}
      {destination && (
        <Marker position={[destination.lat, destination.lng]} icon={destIcon()} />
      )}
      {routes.map((r) => (
        <Polyline
          key={r.id}
          positions={r.coords}
          pathOptions={{
            color: r.color,
            weight: r.weight ?? 5,
            opacity: r.opacity ?? 0.9,
            dashArray: r.dashed ? "8 8" : undefined,
          }}
        />
      ))}
      {pins.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lng]} icon={makeIcon(p.severity)}>
          <Popup>
            <div style={{ minWidth: 200 }}>
              {p.title && <div style={{ fontWeight: 600, marginBottom: 4 }}>{p.title}</div>}
              {p.subtitle && <div style={{ color: "#8a9bb0", fontSize: 12, marginBottom: 8 }}>{p.subtitle}</div>}
              {p.body}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}