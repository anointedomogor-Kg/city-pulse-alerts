import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useRequireRole, useAuth, useAdminIdleTimeout, type Profile } from "@/lib/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { IncidentMap, type MapPin } from "@/components/Map/IncidentMap";
import { severityColor, timeAgo } from "@/lib/format";
import { useIncidentAlerts } from "@/lib/use-incident-alerts";
import { toast } from "sonner";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/admin")({
  component: Admin,
});

type Inc = {
  id: string; type: string; location: string; severity: "critical"|"moderate"|"minor";
  latitude: number; longitude: number; status: string; archived: boolean;
  created_at: string; resolved_at: string | null; reported_by: string;
  affected_roads: string | null;
};

type AuditEntry = {
  id: string; admin_id: string; action: string; target_id: string | null;
  details: Record<string, unknown> | null; created_at: string;
};

type Range = "today" | "7d" | "30d";
const RANGE_DAYS: Record<Range, number> = { today: 1, "7d": 7, "30d": 30 };
const COLORS = { primary: "#1D9E75", critical: "#E24B4A", moderate: "#EF9F27", minor: "#1D9E75", grid: "#2a2d3a", text: "#9ca3af" };

function Admin() {
  useRequireRole(["admin"]);
  const { profile, signOut } = useAuth();
  useIncidentAlerts(profile?.id);
  const idle = useAdminIdleTimeout(profile?.role === "admin");
  const [incidents, setIncidents] = useState<Inc[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [userTab, setUserTab] = useState<"officers"|"operators"|"all">("operators");
  const [sortBy, setSortBy] = useState<keyof Inc>("created_at");
  const [range, setRange] = useState<Range>("7d");
  const [statusFilter, setStatusFilter] = useState<"all"|"active"|"resolved"|"archived">("all");
  const [showAddOfficer, setShowAddOfficer] = useState(false);
  const [showAddAdmin, setShowAddAdmin] = useState(false);

  const logAudit = async (action: string, target_id: string | null = null, details: Record<string, unknown> | null = null) => {
    if (!profile) return;
    await supabase.from("admin_audit_log").insert({ admin_id: profile.id, action, target_id, details });
  };

  const loadAll = async () => {
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const [{ data: incs }, { data: usrs }, { data: log }] = await Promise.all([
      supabase.from("incidents").select("*").gte("created_at", since).order("created_at", { ascending: false }),
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("admin_audit_log").select("*").order("created_at", { ascending: false }).limit(50),
    ]);
    setIncidents((incs as Inc[]) ?? []);
    setUsers((usrs as Profile[]) ?? []);
    setAudit((log as AuditEntry[]) ?? []);
  };

  useEffect(() => {
    loadAll();
    const ch = supabase.channel("admin-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "incidents" }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_audit_log" }, () => loadAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // Filter by range
  const rangeIncidents = useMemo(() => {
    const cutoff = Date.now() - RANGE_DAYS[range] * 86400000;
    return incidents.filter((i) => new Date(i.created_at).getTime() >= cutoff);
  }, [incidents, range]);

  const prevRangeIncidents = useMemo(() => {
    const days = RANGE_DAYS[range];
    const end = Date.now() - days * 86400000;
    const start = end - days * 86400000;
    return incidents.filter((i) => {
      const t = new Date(i.created_at).getTime();
      return t >= start && t < end;
    });
  }, [incidents, range]);

  const stats = useMemo(() => {
    const active = incidents.filter((i) => i.status === "active" && !i.archived).length;
    const resolved = rangeIncidents.filter((i) => i.status === "resolved" && i.resolved_at);
    const avgMin = resolved.length
      ? Math.round(resolved.reduce((a, i) => a + (new Date(i.resolved_at!).getTime() - new Date(i.created_at).getTime()), 0) / resolved.length / 60000)
      : 0;
    const prevResolved = prevRangeIncidents.filter((i) => i.status === "resolved" && i.resolved_at);
    const prevAvg = prevResolved.length
      ? Math.round(prevResolved.reduce((a, i) => a + (new Date(i.resolved_at!).getTime() - new Date(i.created_at).getTime()), 0) / prevResolved.length / 60000)
      : 0;
    const activeOps = users.filter((u) => u.role === "operator" && u.status === "active").length;
    return {
      total: rangeIncidents.length,
      totalPrev: prevRangeIncidents.length,
      active,
      avg: avgMin,
      avgPrev: prevAvg,
      operators: activeOps,
    };
  }, [incidents, rangeIncidents, prevRangeIncidents, users]);

  // Charts
  const dailySeries = useMemo(() => {
    const days = 14;
    const map = new Map<string, number>();
    for (let d = days - 1; d >= 0; d--) {
      const key = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
      map.set(key, 0);
    }
    incidents.forEach((i) => {
      const key = i.created_at.slice(0, 10);
      if (map.has(key)) map.set(key, (map.get(key) ?? 0) + 1);
    });
    return Array.from(map.entries()).map(([date, count]) => ({ date: date.slice(5), count }));
  }, [incidents]);

  const typeSeries = useMemo(() => {
    const m = new Map<string, number>();
    rangeIncidents.forEach((i) => m.set(i.type, (m.get(i.type) ?? 0) + 1));
    return Array.from(m.entries()).map(([type, count]) => ({ type, count }));
  }, [rangeIncidents]);

  const severitySeries = useMemo(() => {
    const active = incidents.filter((i) => i.status === "active" && !i.archived);
    const m = new Map<string, number>();
    active.forEach((i) => m.set(i.severity, (m.get(i.severity) ?? 0) + 1));
    return (["critical","moderate","minor"] as const)
      .map((s) => ({ name: s, value: m.get(s) ?? 0 }))
      .filter((s) => s.value > 0);
  }, [incidents]);

  const officerLeaderboard = useMemo(() => {
    const m = new Map<string, { count: number; totalMs: number; resolvedCount: number }>();
    rangeIncidents.forEach((i) => {
      const entry = m.get(i.reported_by) ?? { count: 0, totalMs: 0, resolvedCount: 0 };
      entry.count++;
      if (i.resolved_at) {
        entry.totalMs += new Date(i.resolved_at).getTime() - new Date(i.created_at).getTime();
        entry.resolvedCount++;
      }
      m.set(i.reported_by, entry);
    });
    return Array.from(m.entries())
      .map(([id, v]) => {
        const u = users.find((u) => u.id === id);
        return {
          name: u?.full_name ?? u?.email ?? "Unknown",
          count: v.count,
          avgMin: v.resolvedCount ? Math.round(v.totalMs / v.resolvedCount / 60000) : 0,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [rangeIncidents, users]);

  const hotspots = useMemo(() => {
    const m = new Map<string, number>();
    rangeIncidents.forEach((i) => {
      if (!i.affected_roads) return;
      i.affected_roads.split(",").map((s) => s.trim()).filter(Boolean).forEach((road) => {
        m.set(road, (m.get(road) ?? 0) + 1);
      });
    });
    return Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [rangeIncidents]);

  const pins: MapPin[] = incidents.filter((i) => i.status === "active").map((i) => ({
    id: i.id, lat: i.latitude, lng: i.longitude, severity: i.severity, title: i.type, subtitle: i.location,
  }));

  const filteredUsers = users.filter((u) =>
    userTab === "all" ? true : userTab === "officers" ? u.role === "officer" : u.role === "operator"
  );

  const sortedIncidents = useMemo(() => {
    let arr = [...incidents];
    if (statusFilter !== "all") {
      arr = arr.filter((i) => statusFilter === "archived" ? i.archived : (i.status === statusFilter && !i.archived));
    }
    arr.sort((a, b) => {
      const av = a[sortBy] ?? "";
      const bv = b[sortBy] ?? "";
      return String(bv).localeCompare(String(av));
    });
    return arr;
  }, [incidents, sortBy, statusFilter]);

  const setStatus = async (id: string, status: "active"|"suspended") => {
    const patch: Partial<Profile> = status === "active"
      ? { status: "active", approved_at: new Date().toISOString() }
      : { status: "suspended" };
    const { error } = await supabase.from("profiles").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await logAudit(status === "active" ? "approve_operator" : "suspend_operator", id);
    toast.success(status === "active" ? "Approved" : "Suspended");
  };

  const reject = async (id: string) => {
    const { error } = await supabase.from("profiles").update({ status: "suspended" }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await logAudit("reject_operator", id);
    toast.success("Rejected");
  };

  const resolveIncident = async (id: string) => {
    const { error } = await supabase.from("incidents")
      .update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: profile?.id })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    await logAudit("resolve_incident", id);
    toast.success("Resolved");
  };

  const archiveIncident = async (id: string) => {
    const { error } = await supabase.from("incidents").update({ archived: true }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await logAudit("archive_incident", id);
    toast.success("Archived & hidden from feeds");
  };

  const exportCSV = () => {
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
    const rows = incidents.filter((i) => i.created_at >= cutoff);
    const header = ["id","type","location","severity","status","archived","created_at","resolved_at","latitude","longitude"];
    const body = rows.map((r) => header.map((h) => JSON.stringify((r as unknown as Record<string,unknown>)[h] ?? "")).join(",")).join("\n");
    const blob = new Blob([header.join(",") + "\n" + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `citypulse-incidents-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    logAudit("export_csv", null, { count: rows.length });
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
        {/* Range filter */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-xl font-semibold">Analytics</h1>
          <div className="flex gap-1 bg-card border border-border rounded-full p-1">
            {(["today","7d","30d"] as const).map((r) => (
              <button key={r} onClick={() => setRange(r)}
                className={`text-xs px-3 py-1.5 rounded-full ${range===r ? "bg-primary text-white" : "text-muted-foreground"}`}>
                {r === "today" ? "Today" : r === "7d" ? "7 days" : "30 days"}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label={`Total incidents (${range})`} value={stats.total} trend={trend(stats.total, stats.totalPrev)} />
          <StatCard label="Active now" value={stats.active} accent />
          <StatCard label="Avg resolution" value={`${stats.avg}m`} trend={trend(stats.avgPrev, stats.avg) /* lower better */} />
          <StatCard label="Active operators" value={stats.operators} />
        </div>

        {/* Charts row */}
        <div className="grid lg:grid-cols-3 gap-4">
          <ChartCard title="Incidents per day (14d)" className="lg:col-span-2">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={dailySeries}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                <XAxis dataKey="date" stroke={COLORS.text} fontSize={11} />
                <YAxis stroke={COLORS.text} fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#1a1d27", border: "1px solid #2a2d3a", borderRadius: 8 }} />
                <Line type="monotone" dataKey="count" stroke={COLORS.primary} strokeWidth={2} dot={{ fill: COLORS.primary, r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Active severity">
            {severitySeries.length === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">No active incidents</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={severitySeries} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {severitySeries.map((s) => (
                      <Cell key={s.name} fill={severityColor[s.name]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#1a1d27", border: "1px solid #2a2d3a", borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <ChartCard title={`Incidents by type (${range})`}>
            {typeSeries.length === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={typeSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                  <XAxis dataKey="type" stroke={COLORS.text} fontSize={10} angle={-15} textAnchor="end" height={60} interval={0} />
                  <YAxis stroke={COLORS.text} fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "#1a1d27", border: "1px solid #2a2d3a", borderRadius: 8 }} />
                  <Bar dataKey="count" fill={COLORS.primary} radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title={`Officer leaderboard (${range})`}>
            <div className="max-h-[260px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground sticky top-0 bg-card">
                  <tr className="text-left"><th className="py-2">Officer</th><th className="py-2 text-right">Reports</th><th className="py-2 text-right">Avg resolve</th></tr>
                </thead>
                <tbody>
                  {officerLeaderboard.length === 0 && <tr><td colSpan={3} className="py-4 text-center text-muted-foreground">No data</td></tr>}
                  {officerLeaderboard.map((o) => (
                    <tr key={o.name} className="border-t border-border">
                      <td className="py-2 truncate max-w-[180px]">{o.name}</td>
                      <td className="py-2 text-right">{o.count}</td>
                      <td className="py-2 text-right text-muted-foreground">{o.avgMin ? `${o.avgMin}m` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <ChartCard title={`Hotspot roads (${range})`}>
            <div className="space-y-1.5 max-h-[260px] overflow-y-auto">
              {hotspots.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No road data</p>}
              {hotspots.map(([road, count]) => {
                const max = hotspots[0][1];
                const pct = Math.round((count / max) * 100);
                return (
                  <div key={road} className="text-sm">
                    <div className="flex justify-between text-xs mb-0.5"><span className="truncate">{road}</span><span className="text-muted-foreground">{count}</span></div>
                    <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: COLORS.primary }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </ChartCard>

          <ChartCard title="Admin activity log">
            <div className="space-y-2 max-h-[260px] overflow-y-auto">
              {audit.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No admin actions yet</p>}
              {audit.map((a) => (
                <div key={a.id} className="text-xs border-b border-border pb-1.5">
                  <span className="text-foreground font-medium">{a.action}</span>
                  {a.target_id && <span className="text-muted-foreground"> · {a.target_id.slice(0,8)}</span>}
                  <span className="text-muted-foreground float-right">{timeAgo(a.created_at)}</span>
                </div>
              ))}
            </div>
          </ChartCard>
        </div>

        <div className="grid lg:grid-cols-[1fr_400px] gap-4">
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="h-[360px]"><IncidentMap pins={pins} /></div>
            </div>

            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h2 className="font-semibold">Incidents (last 30 days)</h2>
                <div className="flex gap-1">
                  {(["all","active","resolved","archived"] as const).map((s) => (
                    <button key={s} onClick={() => setStatusFilter(s)}
                      className={`text-xs px-3 py-1.5 rounded-full ${statusFilter===s ? "bg-primary text-white" : "bg-surface-2 text-muted-foreground"}`}>
                      {s[0].toUpperCase()+s.slice(1)}
                    </button>
                  ))}
                  <button onClick={exportCSV} className="text-xs bg-surface-2 border border-border px-3 py-1.5 rounded-full hover:bg-[#262a36]">Export CSV</button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="text-left">
                      {(["type","severity","location","created_at","resolved_at","status"] as const).map((c) => (
                        <th key={c} className="py-2 pr-3 cursor-pointer" onClick={() => setSortBy(c)}>{c.replace("_"," ")}</th>
                      ))}
                      <th className="py-2 pr-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedIncidents.length === 0 && <tr><td colSpan={7} className="py-4 text-center text-muted-foreground">No incidents</td></tr>}
                    {sortedIncidents.map((i) => (
                      <tr key={i.id} className={`border-t border-border ${i.archived ? "opacity-50" : ""}`}>
                        <td className="py-2 pr-3">{i.type}</td>
                        <td className="py-2 pr-3"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: severityColor[i.severity] }} />{i.severity}</span></td>
                        <td className="py-2 pr-3 truncate max-w-[200px]">{i.location}</td>
                        <td className="py-2 pr-3 text-muted-foreground">{timeAgo(i.created_at)}</td>
                        <td className="py-2 pr-3 text-muted-foreground">{i.resolved_at ? timeAgo(i.resolved_at) : "—"}</td>
                        <td className="py-2 pr-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${i.archived ? "bg-surface-2 text-muted-foreground" : i.status==="active" ? "bg-destructive/20 text-destructive" : "bg-primary/20 text-primary"}`}>
                            {i.archived ? "archived" : i.status}
                          </span>
                        </td>
                        <td className="py-2 pr-3">
                          <div className="flex gap-1">
                            {i.status === "active" && (
                              <button onClick={() => resolveIncident(i.id)} className="text-xs bg-primary/20 text-primary px-2 py-1 rounded-full hover:bg-primary/30">Resolve</button>
                            )}
                            {i.status === "resolved" && !i.archived && (
                              <button onClick={() => archiveIncident(i.id)} className="text-xs bg-surface-2 border border-border px-2 py-1 rounded-full hover:bg-[#262a36]">Archive & remove</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <aside className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="font-semibold">User management</h2>
              <div className="flex gap-1">
                <button onClick={() => setShowAddOfficer(true)} className="text-xs bg-primary text-white px-3 py-1.5 rounded-full">+ Officer</button>
                <button onClick={() => setShowAddAdmin(true)} className="text-xs bg-surface-2 border border-border px-3 py-1.5 rounded-full">+ Admin</button>
              </div>
            </div>
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
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1">{u.role}</div>
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

      {showAddOfficer && (
        <CreateUserModal role="officer" onClose={() => setShowAddOfficer(false)} onCreated={(id) => { logAudit("create_officer", id); loadAll(); }} />
      )}
      {showAddAdmin && (
        <CreateUserModal role="admin" requireReauth currentEmail={profile?.email} onClose={() => setShowAddAdmin(false)} onCreated={(id) => { logAudit("create_admin", id); loadAll(); }} />
      )}

      {idle.warning && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl p-6 max-w-sm w-full text-center">
            <h3 className="font-semibold text-lg mb-2">Session about to expire</h3>
            <p className="text-sm text-muted-foreground mb-4">You'll be signed out in under a minute due to inactivity.</p>
            <button onClick={idle.dismissWarning} className="w-full rounded-full bg-primary text-white py-2.5">Stay signed in</button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent, trend }: { label: string; value: string|number; accent?: boolean; trend?: { delta: number; up: boolean } }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="text-2xl font-semibold" style={accent ? { color: "#E24B4A" } : undefined}>{value}</div>
      <div className="text-xs text-muted-foreground mt-1 flex items-center justify-between gap-2">
        <span className="truncate">{label}</span>
        {trend && trend.delta !== 0 && (
          <span className={`text-[10px] font-medium ${trend.up ? "text-primary" : "text-destructive"}`}>
            {trend.up ? "▲" : "▼"} {Math.abs(trend.delta)}%
          </span>
        )}
      </div>
    </div>
  );
}

function ChartCard({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-card border border-border rounded-xl p-4 ${className}`}>
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      {children}
    </div>
  );
}

function trend(curr: number, prev: number): { delta: number; up: boolean } {
  if (!prev) return { delta: curr ? 100 : 0, up: curr > 0 };
  const delta = Math.round(((curr - prev) / prev) * 100);
  return { delta, up: delta >= 0 };
}

function CreateUserModal({ role, requireReauth, currentEmail, onClose, onCreated }: {
  role: "officer" | "admin";
  requireReauth?: boolean;
  currentEmail?: string;
  onClose: () => void;
  onCreated: (newId: string) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (requireReauth && currentEmail) {
        const { error } = await supabase.auth.signInWithPassword({ email: currentEmail, password: adminPassword });
        if (error) throw new Error("Admin password incorrect");
      }
      // Use Supabase signUp; trigger sets role=officer for email. For admin, manually upgrade after.
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      const newId = data.user?.id;
      if (role === "admin" && newId) {
        await supabase.from("profiles").update({ role: "admin", status: "active", approved_at: new Date().toISOString() }).eq("id", newId);
      }
      if (newId) onCreated(newId);
      toast.success(`${role === "admin" ? "Admin" : "Officer"} created`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()}
        className="bg-card border border-border rounded-xl p-5 w-full max-w-md space-y-3">
        <h3 className="font-semibold">Add {role === "admin" ? "admin" : "city officer"}</h3>
        <input required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name"
          className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm" />
        <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email"
          className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm" />
        <input required type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Temporary password (8+ chars)"
          className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2.5 text-sm" />
        {requireReauth && (
          <input required type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="Your admin password (confirm)"
            className="w-full bg-surface-2 border border-destructive/40 rounded-lg px-3 py-2.5 text-sm" />
        )}
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-full bg-surface-2 border border-border py-2 text-sm">Cancel</button>
          <button type="submit" disabled={submitting} className="flex-1 rounded-full bg-primary text-white py-2 text-sm disabled:opacity-60">
            {submitting ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}