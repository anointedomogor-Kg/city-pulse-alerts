import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { IncidentMap, type MapPin } from "@/components/Map/IncidentMap";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/operator/map")({
  component: OpMap,
});

type Inc = { id:string; type:string; location:string; severity:"critical"|"moderate"|"minor"; latitude:number; longitude:number; status:string };

function OpMap() {
  const [list, setList] = useState<Inc[]>([]);
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("incidents").select("*").eq("status","active").eq("archived", false);
      setList((data as Inc[]) ?? []);
    };
    load();
    const ch = supabase.channel("op-map")
      .on("postgres_changes", { event: "*", schema: "public", table: "incidents" }, () => load()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);
  const pins: MapPin[] = list.map((i) => ({
    id: i.id, lat: i.latitude, lng: i.longitude, severity: i.severity, title: i.type, subtitle: i.location,
  }));
  return (
    <div className="p-4">
      <div className="h-[calc(100vh-160px)]"><IncidentMap pins={pins} /></div>
    </div>
  );
}