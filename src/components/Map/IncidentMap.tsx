import { lazy, Suspense, useEffect, useState } from "react";
import type { ComponentProps } from "react";

const MapInner = lazy(() => import("./MapInner"));
type Props = ComponentProps<typeof MapInner>;

export function IncidentMap(props: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <div
        style={{ height: props.height ?? "100%", width: "100%", borderRadius: 12 }}
        className="bg-card border border-border flex items-center justify-center text-muted-foreground text-sm"
      >
        Loading map…
      </div>
    );
  }
  return (
    <Suspense
      fallback={
        <div
          style={{ height: props.height ?? "100%", width: "100%", borderRadius: 12 }}
          className="bg-card border border-border flex items-center justify-center text-muted-foreground text-sm"
        >
          Loading map…
        </div>
      }
    >
      <MapInner {...props} />
    </Suspense>
  );
}

export type { MapPin } from "./MapInner";