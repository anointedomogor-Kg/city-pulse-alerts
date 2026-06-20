import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/operator/settings")({
  component: Settings,
});

function Settings() {
  const { profile, refreshProfile, signOut } = useAuth();
  const [company, setCompany] = useState(profile?.company_name ?? "");
  const [zone, setZone] = useState("Lagos Metro");
  const [sound, setSound] = useState(true);

  useEffect(() => {
    setCompany(profile?.company_name ?? "");
    const s = localStorage.getItem("citypulse-sound");
    if (s !== null) setSound(s === "1");
    const z = localStorage.getItem("citypulse-zone");
    if (z) setZone(z);
  }, [profile?.company_name]);

  const save = async () => {
    if (!profile) return;
    localStorage.setItem("citypulse-sound", sound ? "1" : "0");
    localStorage.setItem("citypulse-zone", zone);
    await supabase.from("profiles").update({ company_name: company }).eq("id", profile.id);
    await refreshProfile();
    toast.success("Saved");
  };

  return (
    <div className="p-4 space-y-4 max-w-lg">
      <h1 className="text-xl font-semibold">Settings</h1>
      <div className="bg-card border border-border rounded-xl p-4 space-y-4">
        <Field label="Company name">
          <input value={company} onChange={(e)=>setCompany(e.target.value)} className="input" />
        </Field>
        <Field label="Operating zone">
          <select value={zone} onChange={(e)=>setZone(e.target.value)} className="input">
            <option>Lagos Metro</option><option>Lagos Island</option><option>Lagos Mainland</option><option>Ikeja</option><option>Lekki</option>
          </select>
        </Field>
        <label className="flex items-center justify-between">
          <span className="text-sm">Critical alert sound</span>
          <button onClick={() => setSound(!sound)} className={`relative w-11 h-6 rounded-full ${sound ? "bg-primary" : "bg-surface-2 border border-border"}`}>
            <span className={`absolute top-0.5 ${sound ? "right-0.5" : "left-0.5"} w-5 h-5 bg-white rounded-full`} />
          </button>
        </label>
        <button onClick={save} className="w-full rounded-full bg-primary text-white py-2.5 font-medium">Save</button>
      </div>
      <button onClick={signOut} className="w-full rounded-full bg-surface-2 border border-border py-3 text-sm">Sign out</button>
      <style>{`.input { width:100%; background:#20242f; border:1px solid #2a2d3a; border-radius:8px; padding:10px 12px; color:#fff; font-size:14px; }`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><div className="text-xs text-muted-foreground mb-1.5">{label}</div>{children}</label>;
}