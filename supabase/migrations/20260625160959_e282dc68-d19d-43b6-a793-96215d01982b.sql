
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _email TEXT := NEW.email;
  _full_name TEXT := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1));
  _role public.app_role;
  _status public.profile_status := 'active';
  _approved TIMESTAMPTZ := now();
BEGIN
  IF lower(_email) = 'anointedomogor@gmail.com' THEN
    _role := 'admin';
  ELSE
    _role := 'officer';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role, status, approved_at, company_name)
  VALUES (NEW.id, _email, _full_name, _role, _status, _approved, NEW.raw_user_meta_data->>'company_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $function$;

-- Flip any existing pending users to active officers
UPDATE public.profiles
SET status = 'active',
    approved_at = COALESCE(approved_at, now()),
    role = CASE WHEN role = 'operator' THEN 'officer'::app_role ELSE role END
WHERE status = 'pending';
