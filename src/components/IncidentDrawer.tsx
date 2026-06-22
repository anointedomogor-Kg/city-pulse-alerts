import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { severityColor, timeAgo } from "@/lib/format";
import { IncidentMap } from "@/components/Map/IncidentMap";
import { toast } from "sonner";

export type DrawerIncident = {
  id: string;
  type: string;
  location: string;
  severity: "critical" | "moderate" | "minor";
  latitude: number;
  longitude: number;
  created_at: string;
  affected_roads: string | null;
  description?: string | null;
  status: string;
  photo_url?: string | null;
};

type Comment = {
  id: string;
  incident_id: string;
  author_id: string;
  author_email: string;
  author_role: string;
  content: string;
  created_at: string;
};

export function IncidentDrawer({ incident, onClose }: { incident: DrawerIncident | null; onClose: () => void }) {
  const { profile } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!incident) return;
    const load = async () => {
      const { data } = await supabase
        .from("incident_comments")
        .select("*")
        .eq("incident_id", incident.id)
        .order("created_at", { ascending: true });
      setComments((data as Comment[]) ?? []);
    };
    load();
    const ch = supabase
      .channel(`comments-${incident.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "incident_comments", filter: `incident_id=eq.${incident.id}` },
        (payload) => {
          setComments((prev) => {
            const c = payload.new as Comment;
            if (prev.some((p) => p.id === c.id)) return prev;
            return [...prev, c];
          });
          setTimeout(() => listRef.current?.scrollTo({ top: 99999, behavior: "smooth" }), 50);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [incident?.id]);

  const post = async () => {
    if (!incident || !profile || !draft.trim()) return;
    setPosting(true);
    const { error } = await supabase.from("incident_comments").insert({
      incident_id: incident.id,
      author_id: profile.id,
      author_email: profile.email,
      author_role: profile.role,
      content: draft.trim(),
    });
    setPosting(false);
    if (error) return toast.error(error.message);
    setDraft("");
  };

  return (
    <AnimatePresence>
      {incident && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-stretch sm:justify-end"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            className="sm:hidden bg-card border-t border-border w-full max-h-[90vh] rounded-t-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <DrawerBody incident={incident} comments={comments} draft={draft} setDraft={setDraft} post={post} posting={posting} onClose={onClose} listRef={listRef} />
          </motion.div>
          <motion.div
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            className="hidden sm:flex bg-card border-l border-border h-full w-full max-w-md flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <DrawerBody incident={incident} comments={comments} draft={draft} setDraft={setDraft} post={post} posting={posting} onClose={onClose} listRef={listRef} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DrawerBody({
  incident, comments, draft, setDraft, post, posting, onClose, listRef,
}: {
  incident: DrawerIncident; comments: Comment[]; draft: string;
  setDraft: (s: string) => void; post: () => void; posting: boolean;
  onClose: () => void; listRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
      <div className="p-4 flex items-start justify-between border-b border-border">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: severityColor[incident.severity] }} />
            <h2 className="font-semibold truncate font-display">{incident.type}</h2>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{incident.location}</p>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0 ml-2">✕</button>
      </div>
      <div className="h-44 shrink-0">
        <IncidentMap
          center={[incident.latitude, incident.longitude]}
          zoom={15}
          pins={[{ id: incident.id, lat: incident.latitude, lng: incident.longitude, severity: incident.severity, title: incident.type, subtitle: incident.location }]}
        />
      </div>
      <div className="p-4 space-y-2 border-b border-border text-sm">
        {incident.affected_roads && <div><span className="text-muted-foreground">Roads:</span> {incident.affected_roads}</div>}
        {incident.description && <div className="text-muted-foreground">{incident.description}</div>}
        {incident.photo_url && (
          <a href={incident.photo_url} target="_blank" rel="noreferrer">
            <img src={incident.photo_url} alt="Incident" className="rounded-lg w-full max-h-48 object-cover border border-border" />
          </a>
        )}
        <div className="text-xs text-muted-foreground">Reported {timeAgo(incident.created_at)} · {incident.status}</div>
      </div>
      <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[120px]">
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground">Comments · {comments.length}</h3>
        {comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet. Start the thread.</p>}
        <AnimatePresence initial={false}>
          {comments.map((c) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-surface-2 border border-border rounded-lg p-3"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 border border-border text-accent-bright">{c.author_role}</span>
                  <span className="text-xs text-muted-foreground truncate">{c.author_email.split("@")[0]}</span>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(c.created_at)}</span>
              </div>
              <div className="text-sm whitespace-pre-wrap">{c.content}</div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <div className="p-3 border-t border-border flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") post(); }}
          placeholder="Write a comment…"
          className="flex-1 bg-surface-2 border border-border rounded-full px-4 py-2.5 text-sm focus:outline-none focus:border-primary"
        />
        <button
          onClick={post}
          disabled={posting || !draft.trim()}
          className="rounded-full bg-primary text-white px-4 py-2 text-sm font-medium disabled:opacity-50 hover:bg-[#178a66] btn-press"
        >
          Post
        </button>
      </div>
    </>
  );
}