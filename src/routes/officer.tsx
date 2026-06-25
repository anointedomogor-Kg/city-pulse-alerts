import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useRequireRole, useAuth } from "@/lib/use-auth";
import { useIncidentAlerts } from "@/lib/use-incident-alerts";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/officer")({
  component: OfficerLayout,
});

function OfficerLayout() {
  useRequireRole(["officer", "admin"]);
  const { profile, signOut } = useAuth();
  useIncidentAlerts(profile?.id);
  const { pathname } = useLocation();

  const tabs = [
    { to: "/officer", label: "Report", icon: ReportIcon, exact: true },
    { to: "/officer/map", label: "Map", icon: MapIcon },
    { to: "/feed", label: "Feed", icon: PulseIcon },
    { to: "/officer/profile", label: "Profile", icon: UserIcon },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/officer"><Logo size={26} /></Link>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline">{profile?.full_name ?? profile?.email}</span>
            <button onClick={signOut} className="text-sm text-muted-foreground hover:text-foreground">Logout</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 inset-x-0 bg-card border-t border-border z-30">
        <div className="max-w-6xl mx-auto grid grid-cols-4">
          {tabs.map((t) => {
            const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
            return (
              <Link
                key={t.to}
                to={t.to}
                className={`flex flex-col items-center gap-1 py-3 text-xs ${active ? "text-accent-bright" : "text-muted-foreground"}`}
              >
                <t.icon />
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function ReportIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 14h6M9 18h4"/></svg>; }
function MapIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21 3 6"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>; }
function UserIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></svg>; }
function PulseIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l2-7 4 14 2-7h6"/></svg>; }