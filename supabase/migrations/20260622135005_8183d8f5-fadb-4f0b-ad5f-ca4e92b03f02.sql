
CREATE POLICY "Auth can read incident photos" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'incident-photos');
CREATE POLICY "Auth can upload incident photos" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'incident-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Owner can delete own incident photos" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'incident-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
