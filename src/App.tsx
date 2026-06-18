import { useEffect } from 'react';
import { useAppStore, type Manifest } from './store';
import { supabase } from './lib/supabase';
import GalaxyCanvas from './components/canvas/GalaxyCanvas';
import HUD from './components/ui/HUD';
import PhotoViewer from './components/ui/PhotoViewer';
import LoadingScreen from './components/ui/LoadingScreen';

export default function App() {
  const setManifest = useAppStore((s) => s.setManifest);
  const loading = useAppStore((s) => s.loading);
  const setLoading = useAppStore((s) => s.setLoading);
  const setCaptions = useAppStore((s) => s.setCaptions);
  const fetchUploadedPhotos = useAppStore((s) => s.fetchUploadedPhotos);

  useEffect(() => {
    async function init() {
      try {
        const [m, c] = await Promise.all([
          fetch(import.meta.env.BASE_URL + 'photos-manifest.json').then((r) => r.json()),
          fetch(import.meta.env.BASE_URL + 'captions.json').then((r) => r.json()).catch(() => ({})),
        ]);
        setManifest(m as Manifest);
        setCaptions(c as Record<string, string>);
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          useAppStore.setState({ user: session.user, session });
        }
        fetchUploadedPhotos().catch(() => {});
        setLoading(false);
        document.getElementById('loading-splash')?.classList.add('hidden');
      } catch (err) {
        console.error('Failed to load data:', err);
        setLoading(false);
      }
    }
    init();
  }, [setManifest, setCaptions, setLoading, fetchUploadedPhotos]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      useAppStore.setState({ user: session?.user ?? null, session });
      if (session?.user) fetchUploadedPhotos();
    });
    return () => subscription.unsubscribe();
  }, [fetchUploadedPhotos]);

  if (loading) return <LoadingScreen />;

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <GalaxyCanvas />
      <HUD />
      <PhotoViewer />
    </div>
  );
}
