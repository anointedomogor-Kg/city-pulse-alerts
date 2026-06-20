import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/use-auth";

export const Route = createFileRoute("/pending")({
  component: Pending,
});

function Pending() {
  const { profile, refreshProfile, signOut, session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!session) navigate({ to: "/auth" });
    else if (profile && profile.status === "active") navigate({ to: "/" });
  }, [loading, session, profile, navigate]);

  useEffect(() => {
    const t = setInterval(() => refreshProfile(), 30000);
    return () => clearInterval(t);
  }, [refreshProfile]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-card border border-border rounded-xl p-8 text-center">
        <div className="inline-flex items-center gap-2 mb-6">
          <span className="h-3 w-3 rounded-full bg-accent-bright pulse-dot" />
          <span className="text-xl font-bold">CityPulse</span>
        </div>
        <div className="mx-auto w-14 h-14 rounded-full bg-surface-2 border border-border flex items-center justify-center mb-4">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#EF9F27" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
        </div>
        <h1 className="text-2xl font-semibold mb-2">Awaiting approval</h1>
        <p className="text-sm text-muted-foreground mb-4">
          Your operator account is pending admin review. You'll get access here as soon as it's approved.
        </p>
        <p className="text-xs text-muted-foreground mb-6">Signed in as <span className="text-foreground">{profile?.email}</span></p>
        <button onClick={signOut} className="text-sm text-muted-foreground hover:text-foreground underline">Sign out</button>
      </div>
    </div>
  );
}