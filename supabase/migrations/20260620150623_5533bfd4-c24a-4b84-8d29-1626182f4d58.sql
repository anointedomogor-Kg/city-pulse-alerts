
-- Enums
CREATE TYPE public.app_role AS ENUM ('officer', 'operator', 'admin');
CREATE TYPE public.profile_status AS ENUM ('active', 'pending', 'suspended');
CREATE TYPE public.incident_type AS ENUM ('Accident','Road Block','Flooding','Power Outage','Infrastructure Failure','Public Safety','Other');
CREATE TYPE public.incident_severity AS ENUM ('critical','moderate','minor');
CREATE TYPE public.incident_status AS ENUM ('active','resolved');

-- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT NOT NULL,
  role public.app_role NOT NULL DEFAULT 'operator',
  company_name TEXT,
  status public.profile_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- has_role security definer
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.current_role_val()
RETURNS public.app_role LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- profile policies
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can update own profile basic" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Admins manage all profiles" ON public.profiles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- incidents
CREATE TABLE public.incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  type public.incident_type NOT NULL,
  location TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  severity public.incident_severity NOT NULL,
  affected_roads TEXT,
  duration TEXT,
  description TEXT,
  status public.incident_status NOT NULL DEFAULT 'active',
  reported_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.profiles(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.incidents TO authenticated;
GRANT ALL ON public.incidents TO service_role;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view incidents" ON public.incidents
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Officers can insert incidents" ON public.incidents
  FOR INSERT TO authenticated
  WITH CHECK (
    reported_by = auth.uid()
    AND (public.has_role(auth.uid(),'officer') OR public.has_role(auth.uid(),'admin'))
  );
CREATE POLICY "Officers update own incidents" ON public.incidents
  FOR UPDATE TO authenticated
  USING (reported_by = auth.uid() AND public.has_role(auth.uid(),'officer'))
  WITH CHECK (reported_by = auth.uid());
CREATE POLICY "Admins manage incidents" ON public.incidents
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  sent_to_role public.app_role NOT NULL,
  sent_to UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read BOOLEAN NOT NULL DEFAULT false
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (sent_to = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Users mark own notifications read" ON public.notifications
  FOR UPDATE TO authenticated USING (sent_to = auth.uid()) WITH CHECK (sent_to = auth.uid());
CREATE POLICY "Admins manage notifications" ON public.notifications
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- trigger: handle new auth user -> create profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _email TEXT := NEW.email;
  _full_name TEXT := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1));
  _role public.app_role := 'operator';
  _status public.profile_status := 'pending';
  _approved TIMESTAMPTZ := NULL;
BEGIN
  IF lower(_email) = 'anointedomogor@gmail.com' THEN
    _role := 'admin';
    _status := 'active';
    _approved := now();
  END IF;
  INSERT INTO public.profiles (id, email, full_name, role, status, approved_at, company_name)
  VALUES (NEW.id, _email, _full_name, _role, _status, _approved, NEW.raw_user_meta_data->>'company_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- trigger: notify operators on new incident
CREATE OR REPLACE FUNCTION public.notify_operators_on_incident()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (incident_id, sent_to_role, sent_to)
  SELECT NEW.id, 'operator', p.id
  FROM public.profiles p
  WHERE p.role = 'operator' AND p.status = 'active';
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_incident_inserted ON public.incidents;
CREATE TRIGGER on_incident_inserted
  AFTER INSERT ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.notify_operators_on_incident();

-- realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.incidents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

CREATE INDEX idx_incidents_status ON public.incidents(status);
CREATE INDEX idx_incidents_created_at ON public.incidents(created_at DESC);
CREATE INDEX idx_notifications_sent_to ON public.notifications(sent_to, read);
