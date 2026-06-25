import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/use-auth";
import { Logo, LogoMark } from "@/components/Logo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CityPulse — Real-time city incident coordination" },
      { name: "description", content: "Live emergency feeds, smart rerouting, and coordinated response for every city street." },
      { property: "og:title", content: "CityPulse — Real-time city incident coordination" },
      { property: "og:description", content: "Live emergency feeds, smart rerouting, and coordinated response for every city street." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { loading, session, profile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || !session || !profile) return;
    if (profile.role === "admin") navigate({ to: "/admin" });
    else navigate({ to: "/officer" });
  }, [loading, session, profile, navigate]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Ambient backdrop */}
      <div className="absolute inset-0 grid-bg opacity-40" />
      <div
        className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(29,158,117,0.22), transparent 70%)" }}
      />
      <div
        className="absolute top-1/3 -right-40 w-[700px] h-[700px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(63,224,168,0.12), transparent 70%)" }}
      />

      {/* Nav */}
      <header className="relative z-10">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <Logo size={30} />
          <nav className="hidden md:flex items-center gap-7 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#how" className="hover:text-foreground transition-colors">How it works</a>
            <a href="#feed" className="hover:text-foreground transition-colors">Live feed</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground px-3 py-2">Sign in</Link>
            <Link
              to="/auth"
              className="text-sm rounded-full bg-primary hover:bg-[#178a66] text-primary-foreground font-medium px-4 py-2 btn-press btn-shimmer"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pt-12 md:pt-20 pb-20 text-center">
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-accent-bright pulse-dot" />
          Live across the city — right now
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05, duration: 0.55 }}
          className="mt-6 font-display font-bold text-4xl sm:text-5xl md:text-6xl leading-[1.05] tracking-tight"
        >
          The city's pulse,<br />
          <span className="text-transparent bg-clip-text" style={{ backgroundImage: "linear-gradient(120deg, #1D9E75, #3FE0A8)" }}>
            on every street.
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.55 }}
          className="mt-5 mx-auto max-w-xl text-muted-foreground text-base md:text-lg"
        >
          Real-time emergency feeds for everyone in the city. See incidents the second they're reported and get a safer route around them — automatically.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="mt-8 flex flex-col sm:flex-row gap-3 items-center justify-center"
        >
          <Link
            to="/auth"
            className="w-full sm:w-auto rounded-full bg-primary hover:bg-[#178a66] text-primary-foreground font-semibold px-6 py-3 btn-press btn-shimmer"
          >
            Open the live feed →
          </Link>
          <a
            href="#how"
            className="w-full sm:w-auto rounded-full border border-border bg-card/60 hover:bg-card text-foreground px-6 py-3 btn-press"
          >
            See how it works
          </a>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
          className="mt-14 grid grid-cols-3 gap-3 max-w-2xl mx-auto"
        >
          {[
            { v: "23m", l: "Saved per incident" },
            { v: "40%", l: "Fewer delays" },
            { v: "<2s", l: "Alert latency" },
          ].map((s) => (
            <div key={s.l} className="glass rounded-2xl p-4 card-hover">
              <div className="font-display font-bold text-2xl md:text-3xl text-accent-bright">{s.v}</div>
              <div className="text-[11px] md:text-xs text-muted-foreground leading-tight mt-1">{s.l}</div>
            </div>
          ))}
        </motion.div>
      </section>

      {/* Feature cards */}
      <section id="features" className="relative z-10 max-w-6xl mx-auto px-6 pb-20">
        <div className="grid md:grid-cols-3 gap-4">
          <Feature
            icon={<PulseIcon />}
            title="Emergency feed"
            body="A live, location-aware stream of every accident, blockage, flood or outage near you — updated the moment it's reported."
          />
          <Feature
            icon={<RouteIcon />}
            title="Smart rerouting"
            body="Tap a destination, and CityPulse picks the route that avoids the chaos. Powered by OpenStreetMap, no API keys, no cost."
          />
          <Feature
            icon={<RadarIcon />}
            title="Hyperlocal alerts"
            body="Sound, toast and pin animations the second an incident lands within your city. Mute or unmute in one tap."
          />
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="relative z-10 max-w-6xl mx-auto px-6 pb-24">
        <div className="text-center mb-10">
          <div className="inline-flex h-1 w-10 rounded-full bg-primary mb-3" />
          <h2 className="font-display font-bold text-3xl md:text-4xl">From street to screen in seconds</h2>
          <p className="text-muted-foreground mt-2 max-w-xl mx-auto">One platform, three roles working in sync.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { n: "01", t: "Officer reports", b: "An officer drops a pin from the field — incident type, severity, photo, affected roads." },
            { n: "02", t: "Everyone sees it", b: "Every signed-in user instantly sees it on the feed, ranked by distance from where they are." },
            { n: "03", t: "We reroute you", b: "Set a destination. CityPulse picks the route that steers clear of active incidents." },
          ].map((s) => (
            <div key={s.n} className="bg-card border border-border rounded-2xl p-6 card-hover">
              <div className="font-display font-bold text-accent-bright text-sm tracking-widest">{s.n}</div>
              <h3 className="font-display font-bold text-xl mt-2">{s.t}</h3>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{s.b}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section id="feed" className="relative z-10 max-w-4xl mx-auto px-6 pb-24">
        <div className="glass rounded-3xl p-8 md:p-12 text-center card-elevated">
          <LogoMark size={44} />
          <h2 className="mt-4 font-display font-bold text-3xl md:text-4xl">
            Know what's happening. <span className="text-accent-bright">Move around it.</span>
          </h2>
          <p className="text-muted-foreground mt-3 max-w-md mx-auto">
            Sign in to see the live emergency feed for your city and get a safer route in seconds.
          </p>
          <Link
            to="/auth"
            className="mt-6 inline-flex rounded-full bg-primary hover:bg-[#178a66] text-primary-foreground font-semibold px-6 py-3 btn-press btn-shimmer"
          >
            Enter CityPulse →
          </Link>
        </div>
      </section>

      <footer className="relative z-10 border-t border-border">
        <div className="max-w-6xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <Logo size={20} />
          <div>© {new Date().getFullYear()} CityPulse. Built for cities that can't wait.</div>
        </div>
      </footer>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.45 }}
      className="bg-card border border-border rounded-2xl p-6 card-hover"
    >
      <div className="h-11 w-11 rounded-xl bg-primary/15 text-accent-bright flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="font-display font-bold text-lg">{title}</h3>
      <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{body}</p>
    </motion.div>
  );
}

function PulseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h4l2-7 4 14 2-7h6" />
    </svg>
  );
}
function RouteIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="19" r="2.5" />
      <circle cx="18" cy="5" r="2.5" />
      <path d="M6 16.5V12a4 4 0 0 1 4-4h4a4 4 0 0 0 4-4" />
    </svg>
  );
}
function RadarIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <path d="M12 12 L20 6" />
    </svg>
  );
}