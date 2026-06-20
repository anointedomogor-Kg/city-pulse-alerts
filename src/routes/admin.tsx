import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useRequireRole, useAuth, type Profile } from "@/lib/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { IncidentMap, type MapPin } from "@/components/Map/IncidentMap";
import { severityColor, timeAgo } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  component: Admin,
});

type Inc = {
  id: string; type: string; location: string; severity: "critical"|"moderate"|"minor";
  latitude: number; longitude: number; status: string;
  created_at: string; resolved_at: string | null; reported_by: string;
};

function Admin() {
  useRequireRole(["admin"]);
  const { profile, signOut } = useAuth();
  const [incidents, setIncidents] = useState<Inc[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [userTab, setUserTab] = useState<"officers"|"operators"|"all">("operators");
  const [sortBy, setSortBy] = useState<keyof Inc>("created_at");

  const loadAll = async () => {
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const [{ data: incs }, { data: usrs }] = await Promise.all([
      supabase.from("incidents").select("*").gte("created_at", since).order("created_at", { ascending: false }),
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
    ]);
    setIncidents((incs as Inc[]) ?? []);
    setUsers((usrs as Profile[]) ?? []);
  };

  useEffect(() => {
    loadAll();
    const ch = supabase.channel("admin-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "incidents" }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => loadAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const stats = useMemo(() => {
    const active = incidents.filter((i) => i.status === "active").length;
    const resolved = incidents.filter((i) => i.status === "resolved" && i.resolved_at);
    const avgMin = resolved.length
      ? Math.round(resolved.reduce((a, i) => a + (new Date(i.resolved_at!).getTime() - new Date(i.created_at).getTime()), 0) / resolved.length / 60000)
      : 0;
    return {
      week: incidents.length,
      active,
      avg: avgMin,
      operators: users.filter((u) => u.role === "operator").length,
    };
  }, [incidents, users]);

  const pins: MapPin[] = incidents.filter((i) => i.status === "active").map((i) => ({
    id: i.id, lat: i.latitude, lng: i.longitude, severity: i.severity, title: i.type, subtitle: i.location,
  }));

  const filteredUsers = users.filter((u) =>
    userTab === "all" ? true : userTab === "officers" ? u.role === "officer" : u.role === "operator"
  );

  const sortedIncidents = useMemo(() => {
    const arr = [...incidents];
    arr.sort((a, b) => {
      const av = a[sortBy] ?? "";
      const bv = b[sortBy] ?? "";
      return String(bv).localeCompare(String(av));
    });
    return arr;
  }, [incidents, sortBy]);

  const setStatus = async (id: string, status: "active"|"suspended") => {
    const patch: Partial<Profile> = status === "active"
      ? { status: "active", approved_at: new Date().toISOString() }
      : { status: "suspended" };
    const { error } = await supabase.from("profiles").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    else toast.success(status === "active" ? "Approved" : "Suspended");
  };

  const reject = async (id: string) => {
    const { error } = await supabase.from("profiles").update({ status: "suspended" }).eq("id", id);
    if (error) toast.error(error.message); else toast.success("Rejected");
  };

  const exportCSV = () => {
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
    const rows = incidents.filter((i) => i.created_at >= cutoff);
    const header = ["id","type","location","severity","status","created_at","resolved_at","latitude","longitude"];
    const body = rows.map((r) => header.map((h) => JSON.stringify((r as unknown as Record<string,unknown>)[h] ?? "")).join(",")).join("\n");
    const blob = new Blob([header.join(",") + "\n" + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `citypulse-incidents-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/admin" className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-accent-bright pulse-dot" />
            <span className="font-bold">CityPulse</span>
            <span className="text-xs text-muted-foreground border border-border rounded px-2 py-0.5 ml-2">Admin Console</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline">{profile?.email}</span>
            <button onClick={signOut} className="text-sm text-muted-foreground hover:text-foreground">Logout</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Incidents this week" value={stats.week} />
          <StatCard label="Currently active" value={stats.active} accent />
          <StatCard label="Avg resolution" value={`${stats.avg}m`} />
          <StatCard label="Registered operators" value={stats.operators} />
        </div>

        <div className="grid lg:grid-cols-[1fr_400px] gap-4">
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="h-[360px]"><IncidentMap pins={pins} /></div>
            </div>

            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold">Incidents (last 7 days)</h2>
                <button onClick={exportCSV} className="text-xs bg-surface-2 border border-border px-3 py-1.5 rounded-full hover:bg-[#262a36]">Export CSV (30d)</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="text-left">
                      {(["type","severity","location","created_at","resolved_at","status"] as const).map((c) => (
                        <th key={c} className="py-2 pr-3 cursor-pointer" onClick={() => setSortBy(c)}>{c.replace("_"," ")}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedIncidents.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-muted-foreground">No incidents</td></tr>}
                    {sortedIncidents.map((i) => (
                      <tr key={i.id} className="border-t border-border">
                        <td className="py-2 pr-3">{i.type}</td>
                        <td className="py-2 pr-3"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: severityColor[i.severity] }} />{i.severity}</span></td>
                        <td className="py-2 pr-3 truncate max-w-[200px]">{i.location}</td>
                        <td className="py-2 pr-3 text-muted-foreground">{timeAgo(i.created_at)}</td>
                        <td className="py-2 pr-3 text-muted-foreground">{i.resolved_at ? timeAgo(i.resolved_at) : "—"}</td>
                        <td className="py-2 pr-3"><span className={`text-xs px-2 py-0.5 rounded-full ${i.status==="active" ? "bg-destructive/20 text-destructive" : "bg-primary/20 text-primary"}`}>{i.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <aside className="bg-card border border-border rounded-xl p-4">
            <h2 className="font-semibold mb-3">User management</h2>
            <div className="flex gap-1 mb-3">
              {(["officers","operators","all"] as const).map((t) => (
                <button key={t} onClick={() => setUserTab(t)}
                  className={`flex-1 text-xs py-1.5 rounded-full ${userTab===t ? "bg-primary text-white" : "bg-surface-2 text-muted-foreground"}`}>
                  {t[0].toUpperCase()+t.slice(1)}
                </button>
              ))}
            </div>
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {filteredUsers.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No users</p>}
              {filteredUsers.map((u) => (
                <div key={u.id} className="bg-surface-2 border border-border rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{u.full_name ?? u.email}</div>
                      <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                      {u.company_name && <div className="text-xs text-muted-foreground truncate">{u.company_name}</div>}
                    </div>
                    <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${u.status==="active" ? "bg-primary/20 text-primary" : u.status==="pending" ? "bg-moderate/20" : "bg-destructive/20 text-destructive"}`} style={u.status==="pending"?{color:"#EF9F27"}:undefined}>{u.status}</span>
                  </div>
                  {u.status === "pending" && (
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => setStatus(u.id, "active")} className="flex-1 text-xs bg-primary text-white px-3 py-1.5 rounded-full">Approve</button>
                      <button onClick={() => reject(u.id)} className="flex-1 text-xs bg-surface-2 border border-border px-3 py-1.5 rounded-full">Reject</button>
                    </div>
                  )}
                  {u.status === "active" && u.id !== profile?.id && (
                    <button onClick={() => setStatus(u.id, "suspended")} className="mt-2 text-xs text-muted-foreground hover:text-destructive">Suspend</button>
                  )}
                </div>
              ))}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string|number; accent?: boolean }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className={`text-2xl font-semibold ${accent ? "" : ""}`} style={accent ? { color: "#E24B4A" } : undefined}>{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}