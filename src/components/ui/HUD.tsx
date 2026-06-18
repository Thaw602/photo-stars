import { useAppStore } from '../../store';

export default function HUD() {
  const manifest = useAppStore((s) => s.manifest);
  const selectedFile = useAppStore((s) => s.selectedFile);
  const selectFile = useAppStore((s) => s.selectFile);

  if (!manifest) return null;

  return (
    <div className="hud">
      <div className="hud-left">
        <div className="hud-brand">过去 · 现在</div>
        <div className="hud-subtitle">
          {manifest.photoCount} 张照片 · {manifest.videoCount} 个视频
        </div>
      </div>

      <div className="hud-center">
        {selectedFile ? (
          <div className="hud-selected">
            <span className="hud-selected-date">{selectedFile.date}</span>
            <span className="hud-selected-name">
              {selectedFile.name.slice(0, 30)}...
            </span>
            <button className="hud-deselect" onClick={() => selectFile(null)}>
              ✕
            </button>
          </div>
        ) : (
          <div className="hud-hint">点击星空中的光点查看照片</div>
        )}
      </div>

      <div className="hud-right">
        <div className="hud-dates">
          {manifest.dateRange.earliest} ~ {manifest.dateRange.latest}
        </div>
        <div className="hud-count">
          共 {manifest.total} 颗星
        </div>
      </div>
    </div>
  );
}
