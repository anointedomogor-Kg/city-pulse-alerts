import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: "officer" | "operator" | "admin";
  company_name: string | null;
  status: "active" | "pending" | "suspended";
  approved_at: string | null;
  created_at: string;
};

type AuthCtx = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | undefined>(undefined);

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  return (data as Profile) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;

    // Listener first
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      if (!mounted) return;
      setSession(sess);
      if (sess?.user) {
        // defer profile fetch
        setTimeout(() => {
          loadProfile(sess.user.id).then((p) => mounted && setProfile(p));
        }, 0);
      } else {
        setProfile(null);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) {
        loadProfile(data.session.user.id).then((p) => {
          if (mounted) {
            setProfile(p);
            setLoading(false);
          }
        });
      } else {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    navigate({ to: "/auth" });
  };

  const refreshProfile = async () => {
    if (session?.user) {
      const p = await loadProfile(session.user.id);
      setProfile(p);
    }
  };

  return (
    <Ctx.Provider value={{ session, user: session?.user ?? null, profile, loading, signOut, refreshProfile }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function useRequireRole(roles: Array<"officer" | "operator" | "admin">) {
  const auth = useAuth();
  const navigate = useNavigate();
  const rolesKey = roles.join(",");
  useEffect(() => {
    if (auth.loading) return;
    if (!auth.session) {
      navigate({ to: "/auth" });
      return;
    }
    if (!auth.profile) return;
    if (auth.profile.status === "pending") {
      navigate({ to: "/pending" });
      return;
    }
    if (!rolesKey.split(",").includes(auth.profile.role)) {
      navigate({ to: "/" });
    }
  }, [auth.loading, auth.session, auth.profile, rolesKey, navigate]);
  return auth;
}

/**
 * Admin-only 15-minute idle auto-logout with a 1-minute warning.
 * Returns { warning, dismissWarning } so the caller can render a modal.
 */
export function useAdminIdleTimeout(enabled: boolean) {
  const { signOut } = useAuth();
  const [warning, setWarning] = useState(false);
  const lastActivity = useRef(Date.now());

  useEffect(() => {
    if (!enabled) return;
    const reset = () => {
      lastActivity.current = Date.now();
      setWarning(false);
    };
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    const interval = setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      if (idle >= 15 * 60_000) {
        signOut();
      } else if (idle >= 14 * 60_000) {
        setWarning(true);
      }
    }, 5000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, reset));
      clearInterval(interval);
    };
  }, [enabled, signOut]);

  return useMemo(() => ({
    warning,
    dismissWarning: () => { lastActivity.current = Date.now(); setWarning(false); },
  }), [warning]);
}