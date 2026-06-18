import { create } from 'zustand';

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

  // Quality
  quality: 'high' | 'medium' | 'low';
  setQuality: (q: 'high' | 'medium' | 'low') => void;

  // Captions
  captions: Record<string, string>;
  setCaptions: (c: Record<string, string>) => void;

  // Loading
  loading: boolean;
  setLoading: (v: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  manifest: null,
  setManifest: (m) => set({ manifest: m }),

  selectedFile: null,
  selectFile: (f) => set({ selectedFile: f, showViewer: f !== null }),

  showViewer: false,
  setShowViewer: (v) => set({ showViewer: v }),

  captions: {},
  setCaptions: (c) => set({ captions: c }),

  quality: 'high',
  setQuality: (q) => set({ quality: q }),

  loading: true,
  setLoading: (v) => set({ loading: v }),
}));
