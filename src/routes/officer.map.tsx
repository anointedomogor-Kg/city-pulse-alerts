import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { IncidentMap, type MapPin } from "@/components/Map/IncidentMap";
import { supabase } from "@/integrations/supabase/client";
import { severityColor, timeAgo } from "@/lib/format";
import { useAuth } from "@/lib/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/officer/map")({
  component: LiveMap,
});

type Inc = {
  id: string; type: string; location: string; severity: "critical"|"moderate"|"minor";
  latitude: number; longitude: number; created_at: string; resolved_at: string | null; status: string;
};

function LiveMap() {
  const { profile } = useAuth();
  const [list, setList] = useState<Inc[]>([]);
  const [filter, setFilter] = useState<"all"|"critical"|"moderate"|"minor">("all");
  const [flyTo, setFlyTo] = useState<[number, number] | null>(null);

  const load = async () => {
    const { data } = await supabase.from("incidents").select("*").order("created_at", { ascending: false });
    setList((data as Inc[]) ?? []);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("incidents-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "incidents" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const active = list.filter((i) => i.status === "active");
  const filtered = active.filter((i) => filter === "all" || i.severity === filter);

  const stats = useMemo(() => {
    const resolved = list.filter((i) => i.status === "resolved" && i.resolved_at);
    const avgMs = resolved.length
      ? resolved.reduce((a, i) => a + (new Date(i.resolved_at!).getTime() - new Date(i.created_at).getTime()), 0) / resolved.length
      : 0;
    return {
      active: active.length,
      critical: active.filter((i) => i.severity === "critical").length,
      avgMin: avgMs ? Math.round(avgMs / 60000) : 0,
    };
  }, [list, active]);

  const resolveIncident = async (id: string) => {
    if (!profile) return;
    const { error } = await supabase.from("incidents")
      .update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: profile.id })
      .eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("Marked resolved");
  };

  const pins: MapPin[] = filtered.map((i) => ({
    id: i.id, lat: i.latitude, lng: i.longitude, severity: i.severity,
    title: i.type, subtitle: i.location,
    body: (
      <button onClick={() => resolveIncident(i.id)} className="mt-2 text-xs bg-primary text-white px-3 py-1.5 rounded-full">
        Mark as resolved
      </button>
    ),
  }));

  return (
    <div className="p-4">
      <div className="bg-card border border-border rounded-xl p-3 mb-4 grid grid-cols-3 gap-2 text-sm">
        <Stat label="Active" value={stats.active} />
        <Stat label="Critical" value={stats.critical} accent="critical" />
        <Stat label="Avg response" value={`${stats.avgMin}m`} />
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-4">
        <div className="h-[60vh] lg:h-[calc(100vh-220px)]">
          <IncidentMap pins={pins} flyTo={flyTo} />
        </div>

        <aside className="bg-card border border-border rounded-xl p-3 flex flex-col">
          <div className="flex gap-1 mb-3">
            {(["all","critical","moderate","minor"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`flex-1 text-xs py-1.5 rounded-full ${filter===f ? "bg-primary text-white" : "bg-surface-2 text-muted-foreground"}`}>
                {f[0].toUpperCase()+f.slice(1)}
              </button>
            ))}
          </div>
          <div className="overflow-y-auto max-h-[55vh] lg:max-h-[calc(100vh-280px)] divide-y divide-border">
            {filtered.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">No incidents</p>}
            {filtered.map((i) => (
              <div key={i.id} className="py-3">
                <div className="flex items-start gap-2">
                  <span className="h-2.5 w-2.5 rounded-full mt-1.5" style={{ background: severityColor[i.severity] }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{i.type}</div>
                    <div className="text-xs text-muted-foreground truncate">{i.location}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{timeAgo(i.created_at)}</div>
                  </div>
                  <button onClick={() => setFlyTo([i.latitude, i.longitude])}
                    className="text-xs text-accent-bright hover:underline">View</button>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: "critical" }) {
  return (
    <div className="text-center">
      <div className={`text-lg font-semibold ${accent==="critical" ? "text-critical" : ""}`} style={accent==="critical"?{color:"#E24B4A"}:undefined}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}