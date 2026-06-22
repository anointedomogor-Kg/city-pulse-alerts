import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/lib/use-auth";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";
import { motion } from "framer-motion";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — CityPulse" }] }),
  component: AuthPage,
});

function AuthPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [submitting, setSubmitting] = useState(false);
  const [fullName, setFullName] = useState("");

  useEffect(() => {
    if (!loading && session) navigate({ to: "/" });
  }, [loading, session, navigate]);

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName, role: "officer" },
          },
        });
        if (error) throw error;
        toast.success("Officer account created");
      }
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (res.error) toast.error("Google sign-in failed");
    if (res.redirected) return;
    navigate({ to: "/" });
  };

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: "#0A0D14" }}>
      <div className="absolute inset-0 grid-bg opacity-60" />
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full" style={{ background: "radial-gradient(circle, rgba(29,158,117,0.18), transparent 70%)" }} />
      <div className="absolute bottom-0 right-0 w-[600px] h-[600px] rounded-full" style={{ background: "radial-gradient(circle, rgba(63,224,168,0.10), transparent 70%)" }} />

      <div className="relative grid lg:grid-cols-2 gap-10 max-w-6xl mx-auto px-6 py-10 lg:py-20 min-h-screen items-center">
        <div>
          <Logo size={36} />
          <motion.h1
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="mt-8 font-display font-bold text-4xl md:text-5xl leading-tight text-white"
          >
            Real-time incident coordination<br />for cities that can't wait.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="mt-4 text-muted-foreground max-w-md"
          >
            Officers report from the field. Operators reroute in seconds. Admins see the whole city.
          </motion.p>
          <div className="mt-10 grid grid-cols-3 gap-3 max-w-md">
            <StatPill value="23m" label="saved per incident" delay={0.3} />
            <StatPill value="40%" label="fewer delays" delay={0.4} />
            <StatPill value="Live" label="real-time alerts" delay={0.5} />
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="glass rounded-2xl p-6 sm:p-8 w-full max-w-md justify-self-center lg:justify-self-end"
        >
          <div className="flex items-center justify-center mb-6"><Logo size={32} /></div>
          <button
            onClick={handleGoogle}
            className="w-full flex items-center justify-center gap-2 rounded-full border border-border bg-surface-2 hover:bg-[#262a36] text-foreground py-3 font-medium btn-press"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            OR
            <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleEmail} className="space-y-3">
            {mode === "signup" && (
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Full name"
                className="w-full bg-surface-2 border border-border rounded-lg px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
            )}
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Work email"
              className="w-full bg-surface-2 border border-border rounded-lg px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full bg-surface-2 border border-border rounded-lg px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
            {mode === "signup" && (
              <div className="bg-surface-2 border border-border rounded-lg p-3 text-xs text-muted-foreground">
                Signing up creates a <span className="text-foreground font-medium">City Officer</span> account. Operators must sign in with Google.
              </div>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full bg-primary hover:bg-[#178a66] text-primary-foreground font-medium py-3 disabled:opacity-60 btn-press btn-shimmer"
            >
              {submitting ? "Please wait…" : mode === "signin" ? "Sign in" : "Create officer account"}
            </button>
          </form>

          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground mt-4"
          >
            {mode === "signin" ? "New city officer? Create account" : "Have an account? Sign in"}
          </button>
          <p className="text-xs text-muted-foreground text-center mt-6">
            Officers use email & password. Operators sign in with Google and wait for admin approval.
          </p>
        </motion.div>
      </div>
    </div>
  );
}

function StatPill({ value, label, delay }: { value: string; label: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
      className="bg-card/60 border border-border rounded-xl p-3"
    >
      <div className="font-display font-bold text-2xl text-accent-bright">{value}</div>
      <div className="text-[11px] text-muted-foreground leading-tight">{label}</div>
    </motion.div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.5-5.9 7.7-11.3 7.7-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 5.1 29.3 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 18.9 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 5.1 29.3 3 24 3 16.1 3 9.3 7.7 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 45c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.4-4.5 2.2-7.2 2.2-5.4 0-9.7-3.2-11.3-7.7l-6.5 5C9.2 40.2 16 45 24 45z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.2 5.2C40.9 36 45 30.5 45 24c0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );
}