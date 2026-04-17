-- =============================================
-- Storage Policies for app-images bucket
-- Run this in Supabase SQL Editor
-- =============================================

-- Allow anyone to upload (INSERT)
CREATE POLICY "Allow public uploads"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (bucket_id = 'app-images');

-- Allow anyone to read (SELECT)
CREATE POLICY "Allow public reads"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'app-images');

-- Allow anyone to update
CREATE POLICY "Allow public updates"
ON storage.objects
FOR UPDATE
TO public
USING (bucket_id = 'app-images');

-- Allow anyone to delete
CREATE POLICY "Allow public deletes"
ON storage.objects
FOR DELETE
TO public
USING (bucket_id = 'app-images');
