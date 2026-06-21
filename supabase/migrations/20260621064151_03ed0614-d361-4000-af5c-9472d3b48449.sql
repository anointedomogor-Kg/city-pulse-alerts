
-- 1. Add archived flag to incidents
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_incidents_archived ON public.incidents(archived);

-- Prevent non-admins from changing the archived flag
CREATE OR REPLACE FUNCTION public.guard_incident_archive()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.archived IS DISTINCT FROM OLD.archived AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can archive incidents';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_incident_archive ON public.incidents;
CREATE TRIGGER trg_guard_incident_archive
  BEFORE UPDATE ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.guard_incident_archive();

-- 2. Admin audit log
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  target_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read audit log" ON public.admin_audit_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins insert audit log" ON public.admin_audit_log
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'admin') AND admin_id = auth.uid()
  );

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON public.admin_audit_log(created_at DESC);

-- 3. Update sign-up trigger: email = officer/active, google = operator/pending
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _email TEXT := NEW.email;
  _full_name TEXT := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1));
  _provider TEXT := COALESCE(NEW.raw_app_meta_data->>'provider', 'email');
  _role public.app_role;
  _status public.profile_status;
  _approved TIMESTAMPTZ;
BEGIN
  IF lower(_email) = 'anointedomogor@gmail.com' THEN
    _role := 'admin'; _status := 'active'; _approved := now();
  ELSIF _provider = 'google' THEN
    _role := 'operator'; _status := 'pending'; _approved := NULL;
  ELSE
    -- email/password = officer (created by admin or self-signup), active immediately
    _role := 'officer'; _status := 'active'; _approved := now();
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role, status, approved_at, company_name)
  VALUES (NEW.id, _email, _full_name, _role, _status, _approved, NEW.raw_user_meta_data->>'company_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
