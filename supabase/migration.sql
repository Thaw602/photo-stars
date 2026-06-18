-- ============================================
-- Photo Stars — Supabase Database Migration
-- Run this in Supabase SQL Editor
-- ============================================

CREATE TABLE IF NOT EXISTS uploaded_photos (
  id BIGSERIAL PRIMARY KEY,
  global_number INTEGER NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE SEQUENCE IF NOT EXISTS photo_number_seq START 200;

ALTER TABLE uploaded_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view" ON uploaded_photos FOR SELECT USING (true);
CREATE POLICY "Auth users can insert" ON uploaded_photos FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Owners can delete" ON uploaded_photos FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_uploaded_photos_global_number ON uploaded_photos(global_number);
CREATE INDEX IF NOT EXISTS idx_uploaded_photos_created_at ON uploaded_photos(created_at DESC);
