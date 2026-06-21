import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { playIncidentBeep } from "@/lib/format";
import { toast } from "sonner";

type IncidentRow = {
  id: string;
  type: string;
  location: string;
  severity: "critical" | "moderate" | "minor";
  reported_by: string;
  archived?: boolean;
};

/** Subscribe to new incidents, beep + toast (skips own reports + archived). */
export function useIncidentAlerts(currentUserId: string | undefined) {
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!currentUserId) return;
    const ch = supabase
      .channel(`incident-alerts-${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "incidents" },
        (payload) => {
          const inc = payload.new as IncidentRow;
          if (!inc || seen.current.has(inc.id)) return;
          seen.current.add(inc.id);
          if (inc.archived) return;
          if (inc.reported_by === currentUserId) return;
          playIncidentBeep(inc.severity);
          toast(`New ${inc.severity} incident — ${inc.type}`, {
            description: inc.location,
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [currentUserId]);
}
