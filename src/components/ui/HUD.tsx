import { useAppStore } from '../../store';

export default function HUD() {
  const manifest = useAppStore((s) => s.manifest);
  const selectedFile = useAppStore((s) => s.selectedFile);
  const selectFile = useAppStore((s) => s.selectFile);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const clearHighlight = useAppStore((s) => s.clearHighlight);

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
        <div className="hud-search">
          <span className="hud-search-icon">#</span>
          <input
            className="hud-search-input"
            type="text"
            inputMode="numeric"
            placeholder="搜索编号..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                clearHighlight();
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
          {searchQuery && (
            <button className="hud-search-clear" onClick={() => clearHighlight()}>
              ✕
            </button>
          )}
        </div>
        {selectedFile && (
          <div className="hud-selected">
            <span className="hud-selected-date">{selectedFile.date}</span>
            <span className="hud-selected-name">
              {selectedFile.name.slice(0, 30)}...
            </span>
            <button className="hud-deselect" onClick={() => selectFile(null)}>
              ✕
            </button>
          </div>
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
