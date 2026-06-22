import { useEffect, useState } from "react";
import { LogoMark } from "./Logo";

export function Splash({ onDone }: { onDone?: () => void }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setLeaving(true), 1200);
    const t2 = setTimeout(() => onDone?.(), 1600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDone]);
  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#0A0D14] transition-opacity duration-400 ${leaving ? "opacity-0 pointer-events-none" : "opacity-100"}`}
    >
      <div className="flex items-center gap-3 mb-8">
        <LogoMark size={56} />
        <span
          className="font-bold tracking-tight"
          style={{ fontFamily: "'Space Grotesk Variable', sans-serif", fontSize: 36 }}
        >
          <span className="text-white">City</span>
          <span style={{ color: "#1D9E75" }}>Pulse</span>
        </span>
      </div>
      <p className="text-xs text-muted-foreground tracking-widest uppercase mb-10">Real-time city ops</p>
      <div className="w-56 h-1 rounded-full bg-[#1E2235] overflow-hidden">
        <div className="h-full bg-gradient-to-r from-[#1D9E75] to-[#3FE0A8] splash-bar" />
      </div>
    </div>
  );
}