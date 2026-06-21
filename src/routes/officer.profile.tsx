import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/use-auth";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/officer/profile")({
  component: Profile,
});

function Profile() {
  const { profile, signOut } = useAuth();
  const [sound, setSound] = useState(true);
  useEffect(() => {
    const s = localStorage.getItem("citypulse-sound");
    if (s !== null) setSound(s === "1");
  }, []);
  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    localStorage.setItem("citypulse-sound", next ? "1" : "0");
  };
  if (!profile) return null;
  return (
    <div className="p-4 space-y-4">
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="w-14 h-14 rounded-full bg-primary text-white flex items-center justify-center text-xl font-bold mb-3">
          {(profile.full_name ?? profile.email)[0].toUpperCase()}
        </div>
        <h1 className="text-lg font-semibold">{profile.full_name ?? "Officer"}</h1>
        <p className="text-sm text-muted-foreground">{profile.email}</p>
        <div className="mt-3 inline-block text-xs uppercase tracking-wide bg-surface-2 px-2 py-1 rounded">{profile.role}</div>
      </div>
      <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">Notification sound</div>
          <div className="text-xs text-muted-foreground">Beep when new incidents arrive</div>
        </div>
        <button onClick={toggleSound} className={`relative w-11 h-6 rounded-full ${sound ? "bg-primary" : "bg-surface-2 border border-border"}`}>
          <span className={`absolute top-0.5 ${sound ? "right-0.5" : "left-0.5"} w-5 h-5 bg-white rounded-full transition-all`} />
        </button>
      </div>
      <button onClick={signOut} className="w-full rounded-full bg-surface-2 border border-border py-3 text-sm hover:bg-[#262a36]">
        Sign out
      </button>
    </div>
  );
}