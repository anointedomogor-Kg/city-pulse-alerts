import { type CSSProperties } from "react";

type Props = { size?: number; withWordmark?: boolean; className?: string; style?: CSSProperties };

export function Logo({ size = 28, withWordmark = true, className, style }: Props) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`} style={style}>
      <LogoMark size={size} />
      {withWordmark && (
        <span
          className="font-bold tracking-tight"
          style={{ fontFamily: "'Space Grotesk Variable', 'Space Grotesk', sans-serif", fontSize: Math.round(size * 0.72) }}
        >
          <span style={{ color: "#FFFFFF" }}>City</span>
          <span style={{ color: "#1D9E75" }}>Pulse</span>
        </span>
      )}
    </span>
  );
}

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden>
      {/* Pin outline */}
      <path
        d="M24 4c-8.3 0-15 6.6-15 14.7C9 30 24 44 24 44s15-14 15-25.3C39 10.6 32.3 4 24 4z"
        stroke="#1D9E75"
        strokeWidth="3.5"
        fill="#0F1117"
      />
      <circle cx="24" cy="19" r="4.5" stroke="#1D9E75" strokeWidth="2.5" fill="none" />
      {/* Pulse / ECG line through pin */}
      <path
        d="M4 24 H14 L17 17 L21 31 L25 21 L29 27 L32 24 H44"
        stroke="#FFFFFF"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="logo-pulse"
        style={{ filter: "drop-shadow(0 0 6px rgba(63,224,168,0.55))" }}
      />
    </svg>
  );
}