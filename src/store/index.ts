import { create } from 'zustand';
import { supabase, type UploadedPhoto } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

// ==================== Manifest Types ====================

export interface MediaFile {
  id: number;
  name: string;
  date: string;
  type: 'photo' | 'video' | 'other';
  size: number;
  path: string;
}

export interface Manifest {
  total: number;
  photoCount: number;
  videoCount: number;
  dateRange: { earliest: string; latest: string };
  files: MediaFile[];
}

// ==================== App State ====================

interface AppState {
  // Data
  manifest: Manifest | null;
  setManifest: (m: Manifest) => void;

  // Selection
  selectedFile: MediaFile | null;
  selectFile: (f: MediaFile | null) => void;

  // UI
  showViewer: boolean;
  setShowViewer: (v: boolean) => void;

  // Animation
  phase: 'orbs' | 'expand_gold' | 'expand_blue' | 'dual';
  setPhase: (p: 'orbs' | 'expand_gold' | 'expand_blue' | 'dual') => void;

  // Quality
  quality: 'high' | 'medium' | 'low';
  setQuality: (q: 'high' | 'medium' | 'low') => void;

  // Captions
  captions: Record<string, string>;
  setCaptions: (c: Record<string, string>) => void;

  // Loading
  loading: boolean;
  setLoading: (v: boolean) => void;

  // Search
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  highlightedIndex: number | null;
  clearHighlight: () => void;

  // Auth
  user: User | null;
  session: Session | null;
  loginWithGitHub: () => Promise<void>;
  logout: () => Promise<void>;

  // Uploaded photos
  uploadedPhotos: MediaFile[];
  fetchUploadedPhotos: () => Promise<void>;
  uploadPhoto: (file: File, onProgress?: (pct: number) => void) => Promise<void>;
  uploadInProgress: boolean;
  uploadProgress: number;

  // Helpers
  getAllFiles: () => MediaFile[];
}

// ==================== Helpers ====================

function toMediaFile(up: UploadedPhoto, _builtInCount: number): MediaFile {
  const ext = up.file_name.split('.').pop()?.toLowerCase() ?? '';
  const isVideo = ['mp4', 'webm', 'mov'].includes(ext);
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const storageUrl = `${supabaseUrl}/storage/v1/object/public/photo-uploads/${up.storage_path}`;
  return {
    id: up.global_number,
    name: up.file_name,
    date: new Date(up.created_at).toISOString().slice(0, 10),
    type: isVideo ? 'video' : 'photo',
    size: up.file_size,
    path: storageUrl,
  };
}

// ==================== Store ====================

export const useAppStore = create<AppState>((set) => ({
  manifest: null,
  setManifest: (m) => set({ manifest: m }),

  selectedFile: null,
  selectFile: (f) => set({ selectedFile: f, showViewer: f !== null }),

  showViewer: false,
  setShowViewer: (v) => set({ showViewer: v }),

  phase: 'orbs',
  setPhase: (p) => set({ phase: p }),

  captions: {},
  setCaptions: (c) => set({ captions: c }),

  quality: 'high',
  setQuality: (q) => set({ quality: q }),

  loading: true,
  setLoading: (v) => set({ loading: v }),

  searchQuery: '',
  setSearchQuery: (q) => {
    const num = parseInt(q.trim(), 10);
    const state = useAppStore.getState();
    const allFiles = state.getAllFiles?.() ?? state.manifest?.files ?? [];
    if (!Number.isInteger(num) || num < 1 || num > allFiles.length) {
      set({ searchQuery: q, highlightedIndex: null });
    } else {
      set({ searchQuery: q, highlightedIndex: num - 1 });
    }
  },
  highlightedIndex: null,
  clearHighlight: () => set({ searchQuery: '', highlightedIndex: null }),

  user: null,
  session: null,

  loginWithGitHub: async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: window.location.origin + import.meta.env.BASE_URL,
      },
    });
    if (error) console.error('GitHub login failed:', error.message);
  },

  logout: async () => {
    await supabase.auth.signOut();
    set({ user: null, session: null });
  },

  uploadedPhotos: [],

  fetchUploadedPhotos: async () => {
    const { data, error } = await supabase
      .from('uploaded_photos')
      .select('*')
      .order('global_number', { ascending: true });
    if (error) {
      console.error('Failed to load uploaded photos:', error.message);
      return;
    }
    const builtInCount = useAppStore.getState().manifest?.files.length ?? 0;
    const photos: MediaFile[] = (data as UploadedPhoto[]).map((up) =>
      toMediaFile(up, builtInCount)
    );
    set({ uploadedPhotos: photos });
  },

  uploadPhoto: async (file: File, onProgress?: (pct: number) => void) => {
    set({ uploadInProgress: true, uploadProgress: 0 });
    try {
      const { data: maxRow } = await supabase
        .from('uploaded_photos')
        .select('global_number')
        .order('global_number', { ascending: false })
        .limit(1)
        .single();
      const builtInCount = useAppStore.getState().manifest?.files.length ?? 0;
      const nextNumber = maxRow ? maxRow.global_number + 1 : builtInCount + 1;
      const fileExt = file.name.split('.').pop() ?? 'jpg';
      const storagePath = `${nextNumber}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('photo-uploads')
        .upload(storagePath, file, { cacheControl: '31536000', upsert: false });
      if (uploadError) throw uploadError;
      onProgress?.(50);
      const { error: insertError } = await supabase
        .from('uploaded_photos')
        .insert({
          global_number: nextNumber,
          file_name: file.name,
          storage_path: storagePath,
          file_size: file.size,
          mime_type: file.type,
          user_id: useAppStore.getState().user?.id,
        });
      if (insertError) throw insertError;
      onProgress?.(100);
      await useAppStore.getState().fetchUploadedPhotos();
      set({ uploadInProgress: false, uploadProgress: 0 });
    } catch (err: any) {
      console.error('Upload failed:', err.message || err);
      set({ uploadInProgress: false, uploadProgress: 0 });
      throw err;
    }
  },

  uploadInProgress: false,
  uploadProgress: 0,

  getAllFiles: (): MediaFile[] => {
    const state = useAppStore.getState();
    return [...(state.manifest?.files ?? []), ...state.uploadedPhotos];
  },
}));
