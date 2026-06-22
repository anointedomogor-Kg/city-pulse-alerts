import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { severityColor, timeAgo } from "@/lib/format";
import { toast } from "sonner";
import { IncidentDrawer, type DrawerIncident } from "@/components/IncidentDrawer";
import { AnimatePresence, motion } from "framer-motion";

export const Route = createFileRoute("/operator/")({
  component: Feed,
});

type Inc = {
  id: string; type: string; location: string; severity: "critical"|"moderate"|"minor";
  latitude: number; longitude: number; created_at: string; affected_roads: string | null; status: string;
  description?: string | null; photo_url?: string | null;
};

type Filter = "all" | "critical" | "moderate" | "minor" | "ack";

function Feed() {
  const { profile } = useAuth();
  const [list, setList] = useState<Inc[]>([]);
  const [drawer, setDrawer] = useState<DrawerIncident | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [ackIds, setAckIds] = useState<Set<string>>(new Set());
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const seenIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("incidents").select("*").eq("status","active").eq("archived", false).order("created_at", { ascending: false });
      const arr = (data as Inc[]) ?? [];
      arr.forEach((i) => seenIds.current.add(i.id));
      setList(arr);
      // load comment counts
      const ids = arr.map((i) => i.id);
      if (ids.length) {
        const { data: cmts } = await supabase.from("incident_comments").select("incident_id").in("incident_id", ids);
        const counts: Record<string, number> = {};
        (cmts ?? []).forEach((c) => { counts[c.incident_id] = (counts[c.incident_id] ?? 0) + 1; });
        setCommentCounts(counts);
      }
      // load my ack set
      if (profile) {
        const { data: notifs } = await supabase.from("notifications").select("incident_id,read").eq("sent_to", profile.id).eq("read", true);
        setAckIds(new Set((notifs ?? []).map((n) => n.incident_id as string)));
      }
    };
    load();
    const ch = supabase.channel("operator-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "incidents" }, (payload) => {
        const inc = payload.new as Inc;
        if (seenIds.current.has(inc.id)) return;
        seenIds.current.add(inc.id);
        setList((prev) => [inc, ...prev]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "incidents" }, (payload) => {
        const inc = payload.new as Inc;
        setList((prev) =>
          prev
            .map((p) => (p.id === inc.id ? inc : p))
            .filter((p) => p.status === "active" && !(inc as Inc & { archived?: boolean }).archived),
        );
      })
      .subscribe();
    const cmtCh = supabase.channel("operator-comments-count")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "incident_comments" }, (payload) => {
        const c = payload.new as { incident_id: string };
        setCommentCounts((prev) => ({ ...prev, [c.incident_id]: (prev[c.incident_id] ?? 0) + 1 }));
      }).subscribe();
    return () => { supabase.removeChannel(ch); supabase.removeChannel(cmtCh); };
  }, [profile?.id]);

  const acknowledge = async (id: string) => {
    if (!profile) return;
    await supabase.from("notifications").update({ read: true }).eq("incident_id", id).eq("sent_to", profile.id);
    setAckIds((prev) => new Set([...prev, id]));
    toast.success("Acknowledged");
  };

  const filtered = list.filter((i) => {
    if (filter === "all") return true;
    if (filter === "ack") return ackIds.has(i.id);
    return i.severity === filter;
  });

  return (
    <div className="p-4 space-y-4 page-enter">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Live city alerts</h1>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
            <span className="h-2 w-2 rounded-full bg-accent-bright pulse-dot" />
            Connected
          </div>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {(["all","critical","moderate","minor","ack"] as Filter[]).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className="chip" data-active={filter === f}>
            {f === "all" ? "All" : f === "ack" ? "Acknowledged" : f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <div className="text-muted-foreground text-sm">No active incidents right now. You'll be notified instantly when one is reported.</div>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {filtered.map((i) => {
              const acked = ackIds.has(i.id);
              return (
                <motion.div
                  key={i.id}
                  layout
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: acked ? 0.7 : 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ type: "spring", stiffness: 280, damping: 28 }}
                  className="card-hover bg-card border border-border rounded-xl p-4 flex gap-3"
                >
                  <div className="w-1 rounded-full shrink-0" style={{ background: severityColor[i.severity] }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="font-medium flex items-center gap-2">
                        {i.type}
                        {!acked && <span className="h-1.5 w-1.5 rounded-full bg-accent-bright" />}
                      </div>
                      <div className="text-xs text-muted-foreground">{timeAgo(i.created_at)}</div>
                    </div>
                    <div className="text-sm text-muted-foreground">📍 {i.location}</div>
                    {i.affected_roads && <div className="text-xs text-muted-foreground mt-1">🛣️ {i.affected_roads}</div>}
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      {commentCounts[i.id] ? (
                        <span className="text-[11px] bg-surface-2 border border-border px-2 py-1 rounded-full text-muted-foreground">💬 {commentCounts[i.id]} comments</span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">💬 0 comments</span>
                      )}
                      <button onClick={() => setDrawer(i)} className="text-xs bg-surface-2 border border-border px-3 py-1.5 rounded-full hover:bg-[#262a36] btn-press">View Details</button>
                      <button onClick={() => acknowledge(i.id)} disabled={acked}
                        className={`text-xs px-3 py-1.5 rounded-full btn-press ${acked ? "bg-surface-2 text-muted-foreground" : "bg-primary text-white hover:bg-[#178a66]"}`}>
                        {acked ? "✓ Acknowledged" : "Acknowledge"}
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <IncidentDrawer incident={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}