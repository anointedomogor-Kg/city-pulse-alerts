import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { IncidentMap } from "@/components/Map/IncidentMap";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import type { Database } from "@/integrations/supabase/types";
import { reverseGeocode, timeAgo, severityColor } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/officer/")({
  component: ReportPage,
});

type IncidentType = Database["public"]["Enums"]["incident_type"];
const TYPES: IncidentType[] = ["Accident", "Road Block", "Flooding", "Power Outage", "Infrastructure Failure", "Public Safety", "Other"];
const DURATIONS = ["Under 15 min", "15-30 min", "30-60 min", "1-2 hrs", "2+ hrs"];

type Incident = {
  id: string; type: string; location: string; severity: "critical"|"moderate"|"minor";
  created_at: string; status: string;
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
  const [recent, setRecent] = useState<Incident[]>([]);

  const loadRecent = async () => {
    if (!profile) return;
    const { data } = await supabase.from("incidents")
      .select("id,type,location,severity,created_at,status")
      .eq("reported_by", profile.id)
      .order("created_at", { ascending: false })
      .limit(5);
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
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Incident reported. Operators alerted.");
    setPicked(null); setLocation(""); setRoads(""); setDescription(""); setSeverity("moderate");
    loadRecent();
  };

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Report incident</h1>
        <p className="text-sm text-muted-foreground">Tap the map to drop a pin, then fill in details.</p>
      </div>

      <div className="h-[280px]">
        <IncidentMap onPick={handlePick} pickedMarker={picked} />
      </div>

      <div className="bg-card border border-border rounded-xl p-4 space-y-4">
        <Field label="Incident type">
          <select value={type} onChange={(e)=>setType(e.target.value as IncidentType)} className="input">
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>

        <Field label="Location">
          <input value={location} onChange={(e)=>setLocation(e.target.value)} placeholder="Tap map to auto-fill" className="input" />
        </Field>

        <Field label="Severity">
          <div className="grid grid-cols-3 gap-2">
            {(["critical","moderate","minor"] as const).map((s) => (
              <button key={s} type="button" onClick={()=>setSeverity(s)}
                className={`rounded-full py-2 text-sm font-medium border ${severity===s ? "border-transparent text-white" : "border-border text-muted-foreground bg-surface-2"}`}
                style={severity===s ? { background: severityColor[s] } : undefined}
              >{s[0].toUpperCase()+s.slice(1)}</button>
            ))}
          </div>
        </Field>

        <Field label="Affected roads">
          <input value={roads} onChange={(e)=>setRoads(e.target.value)} placeholder="e.g. Allen Avenue, Opebi Link" className="input" />
        </Field>

        <Field label="Estimated duration">
          <select value={duration} onChange={(e)=>setDuration(e.target.value)} className="input">
            {DURATIONS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>

        <Field label="Description (optional)">
          <textarea value={description} onChange={(e)=>setDescription(e.target.value)} rows={3} className="input resize-none" />
        </Field>

        <button onClick={submit} disabled={submitting}
          className="w-full rounded-full bg-primary hover:bg-[#178a66] text-primary-foreground py-3 font-medium disabled:opacity-60">
          {submitting ? "Submitting…" : "Submit & alert all operators"}
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <h2 className="font-semibold mb-3">My recent reports</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reports yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((r) => (
              <li key={r.id} className="py-3 flex items-center gap-3">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: severityColor[r.severity] }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{r.type}</div>
                  <div className="text-xs text-muted-foreground truncate">{r.location}</div>
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap">{timeAgo(r.created_at)}</div>
              </li>
            ))}
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