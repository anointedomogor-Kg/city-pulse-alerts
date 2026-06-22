import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { IncidentMap } from "@/components/Map/IncidentMap";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import type { Database } from "@/integrations/supabase/types";
import { reverseGeocode, timeAgo, severityColor } from "@/lib/format";
import { toast } from "sonner";
import { motion } from "framer-motion";

export const Route = createFileRoute("/officer/")({
  component: ReportPage,
});

type IncidentType = Database["public"]["Enums"]["incident_type"];
const TYPES: { value: IncidentType; emoji: string }[] = [
  { value: "Accident", emoji: "🚗" },
  { value: "Road Block", emoji: "🚧" },
  { value: "Flooding", emoji: "🌊" },
  { value: "Power Outage", emoji: "⚡" },
  { value: "Infrastructure Failure", emoji: "🏗️" },
  { value: "Public Safety", emoji: "🚨" },
  { value: "Other", emoji: "📌" },
];
const DURATIONS = ["Under 15 min", "15-30 min", "30-60 min", "1-2 hrs", "2+ hrs"];

type Incident = {
  id: string; type: string; location: string; severity: "critical"|"moderate"|"minor";
  created_at: string; status: string; archived?: boolean; last_renewed_at?: string;
};

function ReportPage() {
  const { profile } = useAuth();
  const [type, setType] = useState<IncidentType>("Accident");
  const [picked, setPicked] = useState<{lat:number;lng:number}|null>(null);
  const [location, setLocation] = useState("");
  const [severity, setSeverity] = useState<"critical"|"moderate"|"minor">("moderate");
  const [roads, setRoads] = useState("");
  const [duration, setDuration] = useState(DURATIONS[1]);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [recent, setRecent] = useState<Incident[]>([]);

  const loadRecent = async () => {
    if (!profile) return;
    const { data } = await supabase.from("incidents")
      .select("id,type,location,severity,created_at,status,archived,last_renewed_at")
      .eq("reported_by", profile.id)
      .eq("archived", false)
      .order("created_at", { ascending: false })
      .limit(20);
    setRecent((data as Incident[]) ?? []);
  };
  useEffect(() => { loadRecent(); }, [profile?.id]);

  const handlePick = async (lat: number, lng: number) => {
    setPicked({ lat, lng });
    setLocation("Resolving location…");
    const addr = await reverseGeocode(lat, lng);
    setLocation(addr);
  };

  const submit = async () => {
    if (!profile) return;
    if (!picked) { toast.error("Pick a location on the map"); return; }
    if (!location.trim()) { toast.error("Location is required"); return; }
    setSubmitting(true);
    let photo_url: string | null = null;
    if (photo) {
      const path = `${profile.id}/${Date.now()}-${photo.name.replace(/[^a-z0-9.]/gi, "_")}`;
      const { error: upErr } = await supabase.storage.from("incident-photos").upload(path, photo);
      if (upErr) { toast.error("Photo upload failed: " + upErr.message); }
      else {
        const { data: signed } = await supabase.storage.from("incident-photos").createSignedUrl(path, 60 * 60 * 24 * 365);
        photo_url = signed?.signedUrl ?? null;
      }
    }
    const { error } = await supabase.from("incidents").insert({
      type,
      location,
      latitude: picked.lat,
      longitude: picked.lng,
      severity,
      affected_roads: roads || null,
      duration,
      description: description || null,
      reported_by: profile.id,
      photo_url,
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 2000);
    setPicked(null); setLocation(""); setRoads(""); setDescription(""); setSeverity("moderate"); setPhoto(null);
    await supabase.from("activity_events").insert({
      actor_id: profile.id, actor_email: profile.email, actor_role: profile.role,
      action: "reported_incident", target: type,
    });
    loadRecent();
  };

  const renew = async (id: string) => {
    await supabase.from("incidents").update({ last_renewed_at: new Date().toISOString(), renewal_needed: false }).eq("id", id);
    toast.success("Renewed — still active");
    loadRecent();
  };
  const resolve = async (id: string) => {
    await supabase.from("incidents").update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: profile?.id }).eq("id", id);
    toast.success("Marked resolved");
    loadRecent();
  };

  return (
    <div className="p-4 space-y-4 page-enter">
      <div>
        <h1 className="font-display text-2xl font-bold">Report incident</h1>
        <p className="text-sm text-muted-foreground">Tap the map to drop a pin, then fill in details.</p>
      </div>

      <div className="h-[300px] md:h-[380px] relative">
        <IncidentMap onPick={handlePick} pickedMarker={picked} />
        {picked && (
          <div className="absolute top-3 left-3 right-3 z-[400] bg-card/90 backdrop-blur border border-border rounded-lg px-3 py-2 text-xs text-muted-foreground pointer-events-none">
            📍 {location || "Resolving address…"}
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl p-4 space-y-5 card-elevated">
        <Field label="Incident type">
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {TYPES.map((t) => (
              <button key={t.value} type="button" onClick={() => setType(t.value)}
                className="chip" data-active={type === t.value}>
                <span>{t.emoji}</span>{t.value}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Location">
          <div className="flex gap-2">
            <input value={location} onChange={(e)=>setLocation(e.target.value)} placeholder="Tap map to auto-fill" className="input flex-1" />
            <button type="button" onClick={() => picked && handlePick(picked.lat, picked.lng)}
              disabled={!picked} className="text-xs px-3 rounded-full border border-border bg-surface-2 hover:bg-[#262a36] disabled:opacity-50">Re-detect</button>
          </div>
        </Field>

        <Field label="Severity">
          <div className="grid grid-cols-3 gap-2">
            {(["critical","moderate","minor"] as const).map((s) => (
              <button key={s} type="button" onClick={()=>setSeverity(s)}
                className={`btn-press rounded-full py-2.5 text-sm font-medium border ${severity===s ? "border-transparent text-white shadow-lg" : "border-border text-muted-foreground bg-surface-2 hover:text-white"}`}
                style={severity===s ? { background: severityColor[s] } : undefined}
              >{s[0].toUpperCase()+s.slice(1)}</button>
            ))}
          </div>
        </Field>

        <Field label="Affected roads">
          <input value={roads} onChange={(e)=>setRoads(e.target.value)} placeholder="e.g. Allen Avenue, Opebi Link" className="input" />
        </Field>

        <Field label="Estimated duration">
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {DURATIONS.map((d) => (
              <button key={d} type="button" onClick={() => setDuration(d)} className="chip" data-active={duration === d}>{d}</button>
            ))}
          </div>
        </Field>

        <Field label="Description (optional)">
          <textarea value={description} onChange={(e)=>setDescription(e.target.value)} rows={3} className="input resize-none" />
        </Field>

        <Field label="Photo (optional)">
          <input type="file" accept="image/*" onChange={(e)=>setPhoto(e.target.files?.[0] ?? null)}
            className="text-sm text-muted-foreground file:mr-3 file:py-2 file:px-3 file:rounded-full file:border-0 file:bg-surface-2 file:text-foreground file:text-xs hover:file:bg-[#262a36]" />
        </Field>

        <motion.button whileTap={{ scale: 0.97 }} onClick={submit} disabled={submitting || submitted}
          className={`btn-shimmer w-full rounded-full text-white py-3.5 font-semibold disabled:opacity-80 transition-colors ${submitted ? "bg-accent-bright" : "bg-gradient-to-r from-primary to-[#178a66] hover:from-[#178a66] hover:to-primary"}`}>
          {submitted ? "✓ Incident Reported!" : submitting ? "Submitting…" : "Submit & Alert All Operators"}
        </motion.button>
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <h2 className="font-display font-bold mb-3">Your past reports</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reports yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((r) => {
              const renewed = r.last_renewed_at ? new Date(r.last_renewed_at).getTime() : new Date(r.created_at).getTime();
              const staleHrs = (Date.now() - renewed) / 3_600_000;
              const stale = r.status === "active" && staleHrs >= 72;
              return (
                <li key={r.id} className="py-3 flex items-center gap-3">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: severityColor[r.severity] }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate flex items-center gap-2">
                      {r.type}
                      <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded border ${r.status === "resolved" ? "border-muted-foreground text-muted-foreground" : "border-primary text-accent-bright"}`}>{r.status}</span>
                      {stale && <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-moderate/20 text-moderate border border-moderate/40">Still active — 3 days</span>}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{r.location}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {stale && <button onClick={() => renew(r.id)} className="text-[11px] px-2 py-1 rounded-full bg-surface-2 border border-border hover:border-primary">Confirm</button>}
                    {r.status === "active" && <button onClick={() => resolve(r.id)} className="text-[11px] px-2 py-1 rounded-full bg-primary text-white hover:bg-[#178a66]">Resolve</button>}
                    <div className="text-xs text-muted-foreground whitespace-nowrap">{timeAgo(r.created_at)}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <style>{`.input { width:100%; background:#20242f; border:1px solid #2a2d3a; border-radius:8px; padding:10px 12px; color:#fff; font-size:14px; } .input:focus { outline:none; border-color:#1D9E75; }`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs text-muted-foreground mb-1.5">{label}</div>
      {children}
    </label>
  );
}