import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/use-auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CityPulse" },
      { name: "description", content: "Real-time city incident management." },
    ],
  }),
  component: Index,
});

function Index() {
  const { loading, session, profile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate({ to: "/auth" });
      return;
    }
    if (!profile) return;
    if (profile.role === "admin") navigate({ to: "/admin" });
    else navigate({ to: "/officer" });
  }, [loading, session, profile, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
      <div className="flex items-center gap-3">
        <span className="h-2 w-2 rounded-full bg-primary pulse-dot" />
        <span>Loading CityPulse…</span>
      </div>
    </div>
  );
}
