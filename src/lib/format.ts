export function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - d);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

export const severityColor: Record<string, string> = {
  critical: "#E24B4A",
  moderate: "#EF9F27",
  minor: "#1D9E75",
};

export const severityLabel: Record<string, string> = {
  critical: "Critical",
  moderate: "Moderate",
  minor: "Minor",
};

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      { headers: { "Accept-Language": "en" } },
    );
    if (!res.ok) throw new Error("geocode failed");
    const data = await res.json();
    return data.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

export function playCriticalPing() {
  if (typeof window === "undefined") return;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.4);
  } catch {
    /* ignore */
  }
}

export function isSoundOn(): boolean {
  if (typeof window === "undefined") return false;
  return (localStorage.getItem("citypulse-sound") ?? "1") === "1";
}

/** Two-tone urgent for critical, single soft tone for moderate/minor. */
export function playIncidentBeep(severity: "critical" | "moderate" | "minor") {
  if (typeof window === "undefined") return;
  if (!isSoundOn()) return;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const now = ctx.currentTime;
    const beep = (freq: number, start: number, dur: number, vol: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(freq, now + start);
      g.gain.setValueAtTime(0.0001, now + start);
      g.gain.exponentialRampToValueAtTime(vol, now + start + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      o.connect(g).connect(ctx.destination);
      o.start(now + start);
      o.stop(now + start + dur + 0.02);
    };
    if (severity === "critical") {
      beep(1320, 0, 0.18, 0.22);
      beep(1760, 0.22, 0.22, 0.22);
    } else if (severity === "moderate") {
      beep(880, 0, 0.25, 0.14);
    } else {
      beep(660, 0, 0.2, 0.1);
    }
  } catch {
    /* ignore */
  }
}