import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { playCriticalPing, severityColor, timeAgo } from "@/lib/format";
import { IncidentMap } from "@/components/Map/IncidentMap";
import { toast } from "sonner";

export const Route = createFileRoute("/operator/")({
  component: Feed,
});

type Inc = {
  id: string; type: string; location: string; severity: "critical"|"moderate"|"minor";
  latitude: number; longitude: number; created_at: string; affected_roads: string | null; status: string;
};

function Feed() {
  const { profile } = useAuth();
  const [list, setList] = useState<Inc[]>([]);
  const [modal, setModal] = useState<Inc | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const seenIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const s = localStorage.getItem("citypulse-sound");
    if (s !== null) setSoundOn(s === "1");
    const load = async () => {
      const { data } = await supabase.from("incidents").select("*").eq("status","active").order("created_at", { ascending: false });
      const arr = (data as Inc[]) ?? [];
      arr.forEach((i) => seenIds.current.add(i.id));
      setList(arr);
    };
    load();
    const ch = supabase.channel("operator-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "incidents" }, (payload) => {
        const inc = payload.new as Inc;
        if (seenIds.current.has(inc.id)) return;
        seenIds.current.add(inc.id);
        setList((prev) => [inc, ...prev]);
        if (inc.severity === "critical" && (localStorage.getItem("citypulse-sound") ?? "1") === "1") {
          playCriticalPing();
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "incidents" }, (payload) => {
        const inc = payload.new as Inc;
        setList((prev) => prev.map((p) => p.id === inc.id ? inc : p).filter((p) => p.status === "active"));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const acknowledge = async (id: string) => {
    if (!profile) return;
    await supabase.from("notifications").update({ read: true }).eq("incident_id", id).eq("sent_to", profile.id);
    toast.success("Acknowledged");
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Live city alerts</h1>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
            <span className="h-2 w-2 rounded-full bg-accent-bright pulse-dot" />
            Connected
          </div>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <div className="text-muted-foreground text-sm">No active incidents right now. You'll be notified instantly when one is reported.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((i) => (
            <div key={i.id} className="slide-in bg-card border border-border rounded-xl p-4 flex gap-3">
              <div className="w-1 rounded-full" style={{ background: severityColor[i.severity] }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="font-medium">{i.type}</div>
                  <div className="text-xs text-muted-foreground">{timeAgo(i.created_at)}</div>
                </div>
                <div className="text-sm text-muted-foreground">{i.location}</div>
                {i.affected_roads && <div className="text-xs text-muted-foreground mt-1">Roads: {i.affected_roads}</div>}
                <div className="flex gap-2 mt-3">
                  <button onClick={() => setModal(i)} className="text-xs bg-surface-2 border border-border px-3 py-1.5 rounded-full hover:bg-[#262a36]">View on map</button>
                  <button onClick={() => acknowledge(i.id)} className="text-xs bg-primary text-white px-3 py-1.5 rounded-full hover:bg-[#178a66]">Acknowledge</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setModal(null)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 flex items-center justify-between border-b border-border">
              <div>
                <div className="font-semibold">{modal.type}</div>
                <div className="text-xs text-muted-foreground">{modal.location}</div>
              </div>
              <button onClick={() => setModal(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="h-[320px]">
              <IncidentMap center={[modal.latitude, modal.longitude]} zoom={15}
                pins={[{ id: modal.id, lat: modal.latitude, lng: modal.longitude, severity: modal.severity, title: modal.type, subtitle: modal.location }]}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}