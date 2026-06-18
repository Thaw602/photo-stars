import { useEffect } from 'react';
import { useAppStore, type Manifest } from './store';
import GalaxyCanvas from './components/canvas/GalaxyCanvas';
import HUD from './components/ui/HUD';
import PhotoViewer from './components/ui/PhotoViewer';
import LoadingScreen from './components/ui/LoadingScreen';

export default function App() {
  const setManifest = useAppStore((s) => s.setManifest);
  const loading = useAppStore((s) => s.loading);
  const setLoading = useAppStore((s) => s.setLoading);

  const setCaptions = useAppStore((s) => s.setCaptions);

  useEffect(() => {
    Promise.all([
      fetch('/photos-manifest.json').then((r) => r.json()),
      fetch('/captions.json').then((r) => r.json()).catch(() => ({})),
    ])
      .then(([m, c]) => {
        setManifest(m as Manifest);
        setCaptions(c as Record<string, string>);
        setLoading(false);
        document.getElementById('loading-splash')?.classList.add('hidden');
      })
      .catch((err) => {
        console.error('加载数据失败:', err);
        setLoading(false);
      });
  }, [setManifest, setCaptions, setLoading]);

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <GalaxyCanvas />
      <HUD />
      <PhotoViewer />
    </div>
  );
}
