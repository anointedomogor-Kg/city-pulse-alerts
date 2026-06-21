import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useRequireRole, useAuth } from "@/lib/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useIncidentAlerts } from "@/lib/use-incident-alerts";

export const Route = createFileRoute("/operator")({
  component: OperatorLayout,
});

function OperatorLayout() {
  useRequireRole(["operator", "admin"]);
  const { profile, signOut } = useAuth();
  useIncidentAlerts(profile?.id);
  const [unread, setUnread] = useState(0);
  const { pathname } = useLocation();

  useEffect(() => {
    if (!profile) return;
    const load = async () => {
      const { count } = await supabase.from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("sent_to", profile.id).eq("read", false);
      setUnread(count ?? 0);
    };
    load();
    const ch = supabase.channel("notif-count")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `sent_to=eq.${profile.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.id]);

  const tabs = [
    { to: "/operator", label: "Feed", exact: true },
    { to: "/operator/map", label: "Map" },
    { to: "/operator/settings", label: "Settings" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/operator" className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-accent-bright pulse-dot" />
            <span className="font-bold">CityPulse</span>
          </Link>
          <div className="flex items-center gap-3">
            <div className="relative">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>
              {unread > 0 && <span className="absolute -top-1 -right-1 bg-destructive text-white text-[10px] rounded-full px-1.5 py-0.5">{unread}</span>}
            </div>
            <span className="text-sm text-muted-foreground hidden sm:inline">{profile?.company_name ?? profile?.email}</span>
            <button onClick={signOut} className="text-sm text-muted-foreground hover:text-foreground">Logout</button>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto"><Outlet /></main>
      <nav className="fixed bottom-0 inset-x-0 bg-card border-t border-border z-30">
        <div className="max-w-6xl mx-auto grid grid-cols-3">
          {tabs.map((t) => {
            const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
            return (
              <Link key={t.to} to={t.to} className={`text-center py-3 text-sm ${active ? "text-accent-bright" : "text-muted-foreground"}`}>{t.label}</Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}