import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { IncidentMap, type MapPin, type RouteLine } from "@/components/Map/IncidentMap";
import { useIncidentAlerts } from "@/lib/use-incident-alerts";
import { Logo } from "@/components/Logo";
import { severityColor, timeAgo } from "@/lib/format";
import { IncidentDrawer, type DrawerIncident } from "@/components/IncidentDrawer";

export const Route = createFileRoute("/feed")({
  head: () => ({
    meta: [
      { title: "Emergency Feed — CityPulse" },
      { name: "description", content: "Live emergency incidents near you, with smart rerouting suggestions." },
    ],
  }),
  component: FeedPage,
});

type Inc = {
  id: string;
  type: string;
  location: string;
  severity: "critical" | "moderate" | "minor";
  latitude: number;
  longitude: number;
  created_at: string;
  affected_roads: string | null;
  status: string;
  description?: string | null;
  photo_url?: string | null;
};

const EARTH_KM = 6371;
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(s));
}

/** Closest point on a polyline (km) from a given point. */
function minDistanceToRouteKm(route: [number, number][], p: { lat: number; lng: number }) {
  let min = Infinity;
  for (const [lat, lng] of route) {
    const d = haversineKm({ lat, lng }, p);
    if (d < min) min = d;
  }
  return min;
}

type OsrmRoute = {
  geometry: { coordinates: [number, number][] };
  distance: number; // meters
  duration: number; // seconds
};

function FeedPage() {
  const { session, profile, loading, signOut } = useAuth();
  const navigate = useNavigate();
  useIncidentAlerts(profile?.id);

  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [incidents, setIncidents] = useState<Inc[]>([]);
  const [destination, setDestination] = useState<{ lat: number; lng: number } | null>(null);
  const [routes, setRoutes] = useState<OsrmRoute[]>([]);
  const [routing, setRouting] = useState(false);
  const [bestIdx, setBestIdx] = useState<number | null>(null);
  const [drawer, setDrawer] = useState<DrawerIncident | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  // Geolocation
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("Location not supported");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGeoError("Location permission denied — showing all incidents."),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, []);

  // Load + subscribe to active incidents
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("incidents")
        .select("*")
        .eq("status", "active")
        .eq("archived", false)
        .order("created_at", { ascending: false });
      setIncidents((data as Inc[]) ?? []);
    };
    load();
    const ch = supabase
      .channel("feed-incidents")
      .on("postgres_changes", { event: "*", schema: "public", table: "incidents" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const sorted = useMemo(() => {
    if (!userPos) return incidents;
    return [...incidents].sort(
      (a, b) =>
        haversineKm(userPos, { lat: a.latitude, lng: a.longitude }) -
        haversineKm(userPos, { lat: b.latitude, lng: b.longitude }),
    );
  }, [incidents, userPos]);

  const nearby = useMemo(() => {
    if (!userPos) return sorted.slice(0, 20);
    return sorted.filter(
      (i) => haversineKm(userPos, { lat: i.latitude, lng: i.longitude }) <= 25,
    );
  }, [sorted, userPos]);

  const pins: MapPin[] = sorted.map((i) => ({
    id: i.id,
    lat: i.latitude,
    lng: i.longitude,
    severity: i.severity,
    title: i.type,
    subtitle: i.location,
  }));

  const planRoute = async (
    target?: { lat: number; lng: number } | null,
    origin?: { lat: number; lng: number } | null,
  ) => {
    const dest = target ?? destination;
    const from = origin ?? userPos;
    if (!from || !dest) return;
    setRouting(true);
    setBestIdx(null);
    try {
      const url =
        `https://router.project-osrm.org/route/v1/driving/` +
        `${from.lng},${from.lat};${dest.lng},${dest.lat}` +
        `?overview=full&geometries=geojson&alternatives=true`;
      const res = await fetch(url);
      const json = (await res.json()) as { routes: OsrmRoute[] };
      const list = json.routes ?? [];
      setRoutes(list);
      // pick safest: fewest active incidents within 250m of polyline
      let best = 0;
      let bestScore = Infinity;
      list.forEach((r, idx) => {
        const line = r.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
        const hits = incidents.reduce((acc, inc) => {
          const km = minDistanceToRouteKm(line, { lat: inc.latitude, lng: inc.longitude });
          if (km < 0.25) acc += inc.severity === "critical" ? 3 : inc.severity === "moderate" ? 2 : 1;
          return acc;
        }, 0);
        // tie-breaker: shorter wins
        const score = hits * 1_000_000 + r.duration;
        if (score < bestScore) {
          bestScore = score;
          best = idx;
        }
      });
      setBestIdx(list.length ? best : null);
    } catch {
      // ignore
    } finally {
      setRouting(false);
    }
  };

  const routeLines: RouteLine[] = routes.map((r, idx) => {
    const isBest = idx === bestIdx;
    return {
      id: `r-${idx}`,
      coords: r.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
      color: isBest ? "#3FE0A8" : "#5A6B7A",
      weight: isBest ? 6 : 4,
      opacity: isBest ? 0.95 : 0.55,
      dashed: !isBest,
    };
  });

  const onMapClick = (lat: number, lng: number) => {
    const d = { lat, lng };
    setDestination(d);
    if (userPos) planRoute(d, userPos);
  };

  const clearRoute = () => {
    setDestination(null);
    setRoutes([]);
    setBestIdx(null);
  };

  const bestRoute = bestIdx != null ? routes[bestIdx] : null;
  const defaultRoute = routes[0];
  const savedMin = bestRoute && defaultRoute ? Math.max(0, Math.round((defaultRoute.duration - bestRoute.duration) / 60)) : 0;

  return (
    <div className="min-h-screen bg-background text-foreground pb-10">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/"><Logo size={26} /></Link>
          <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-bright pulse-dot" />
            Live • {incidents.length} active citywide
          </div>
          <div className="flex items-center gap-3">
            {profile?.role === "officer" || profile?.role === "admin" ? (
              <Link to={profile.role === "admin" ? "/admin" : "/officer"} className="text-sm text-muted-foreground hover:text-foreground">Dashboard</Link>
            ) : profile?.role === "operator" ? (
              <Link to="/operator" className="text-sm text-muted-foreground hover:text-foreground">Console</Link>
            ) : null}
            <button onClick={signOut} className="text-sm text-muted-foreground hover:text-foreground">Logout</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-5 space-y-4">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl md:text-3xl font-bold">Emergency feed near you</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live incidents around your location. Tap the map to set a destination — we'll pick the safest route.
          </p>
        </motion.div>

        {geoError && (
          <div className="bg-card border border-border rounded-xl px-4 py-3 text-xs text-muted-foreground">
            {geoError}
          </div>
        )}

        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4">
          <div className="space-y-3">
            <div className="h-[340px] md:h-[460px] relative rounded-xl overflow-hidden border border-border card-elevated">
              <IncidentMap
                center={userPos ? [userPos.lat, userPos.lng] : [6.5244, 3.3792]}
                zoom={userPos ? 13 : 11}
                pins={pins}
                onPick={onMapClick}
                userPos={userPos}
                destination={destination}
                routes={routeLines}
              />
              <div className="absolute top-3 left-3 right-3 z-[400] flex items-center justify-between gap-2 pointer-events-none">
                <div className="bg-card/90 backdrop-blur border border-border rounded-full px-3 py-1.5 text-xs text-muted-foreground">
                  {userPos ? "📍 Your location" : "📍 Locating…"}
                </div>
                {destination && (
                  <button
                    onClick={clearRoute}
                    className="pointer-events-auto text-[11px] bg-card/90 backdrop-blur border border-border rounded-full px-3 py-1.5 text-muted-foreground hover:text-foreground"
                  >
                    Clear route
                  </button>
                )}
              </div>
            </div>

            <AnimatePresence>
              {(destination || routing) && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="bg-card border border-border rounded-xl p-4 card-elevated"
                >
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <div className="text-xs text-muted-foreground">Safe route suggestion</div>
                      <div className="font-display font-bold text-xl mt-0.5">
                        {routing
                          ? "Calculating safest route…"
                          : bestRoute
                            ? `${(bestRoute.distance / 1000).toFixed(1)} km · ~${Math.round(bestRoute.duration / 60)} min`
                            : "No route found"}
                      </div>
                      {bestRoute && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {savedMin > 0
                            ? `Avoids ${routes.length - 1} alternative route${routes.length > 2 ? "s" : ""} crossing active incidents — saves ~${savedMin} min.`
                            : "Path is the most direct option clear of active incidents."}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1.5"><span className="h-1 w-5 rounded-full" style={{ background: "#3FE0A8" }} /> Safest</span>
                      <span className="flex items-center gap-1.5"><span className="h-1 w-5 rounded-full" style={{ background: "#5A6B7A" }} /> Alternative</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="bg-card border border-border rounded-xl p-4 card-elevated max-h-[680px] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-bold">Live incidents</h2>
              <span className="text-[11px] text-muted-foreground">{nearby.length} nearby</span>
            </div>
            {nearby.length === 0 ? (
              <div className="text-sm text-muted-foreground py-10 text-center">
                Nothing active right now — the streets are clear.
              </div>
            ) : (
              <ul className="space-y-2">
                <AnimatePresence initial={false}>
                  {nearby.map((i) => {
                    const km = userPos ? haversineKm(userPos, { lat: i.latitude, lng: i.longitude }) : null;
                    return (
                      <motion.li
                        key={i.id}
                        layout
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ type: "spring", stiffness: 280, damping: 28 }}
                        className="bg-surface-2 border border-border rounded-lg p-3 flex gap-3 card-hover"
                      >
                        <div className="w-1 rounded-full shrink-0" style={{ background: severityColor[i.severity] }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-medium truncate text-sm">{i.type}</div>
                            <div className="text-[11px] text-muted-foreground shrink-0">{timeAgo(i.created_at)}</div>
                          </div>
                          <div className="text-xs text-muted-foreground truncate mt-0.5">📍 {i.location}</div>
                          <div className="flex items-center justify-between mt-2 gap-2 flex-wrap">
                            <div className="text-[11px] text-muted-foreground">
                              {km != null ? `${km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`} away` : "—"}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setDrawer(i)}
                                className="text-[11px] px-2.5 py-1 rounded-full bg-card border border-border hover:border-primary btn-press"
                              >
                                Details
                              </button>
                              <button
                                disabled={!userPos}
                                onClick={() => {
                                  const d = { lat: i.latitude, lng: i.longitude };
                                  setDestination(d);
                                  planRoute(d, userPos);
                                }}
                                className="text-[11px] px-2.5 py-1 rounded-full bg-primary text-white hover:bg-[#178a66] disabled:opacity-50 btn-press"
                              >
                                Reroute
                              </button>
                            </div>
                          </div>
                        </div>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            )}
          </div>
        </div>
      </main>

      <IncidentDrawer incident={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}