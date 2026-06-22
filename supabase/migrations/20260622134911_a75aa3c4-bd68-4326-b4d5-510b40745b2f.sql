
-- Incidents new fields
ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS last_renewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS renewal_needed BOOLEAN NOT NULL DEFAULT false;

-- Profiles last active
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

-- Comments
CREATE TABLE IF NOT EXISTS public.incident_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_email TEXT NOT NULL,
  author_role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.incident_comments TO authenticated;
GRANT ALL ON public.incident_comments TO service_role;
ALTER TABLE public.incident_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth can read comments" ON public.incident_comments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth can post own comments" ON public.incident_comments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Admin can delete comments" ON public.incident_comments
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_incident_comments_incident ON public.incident_comments(incident_id, created_at);

-- Activity events
CREATE TABLE IF NOT EXISTS public.activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  target TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.activity_events TO authenticated;
GRANT ALL ON public.activity_events TO service_role;
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth can read activity" ON public.activity_events
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth can insert own activity" ON public.activity_events
  FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid() OR actor_id IS NULL);

CREATE INDEX IF NOT EXISTS idx_activity_events_created ON public.activity_events(created_at DESC);

-- Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.incident_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_events;
