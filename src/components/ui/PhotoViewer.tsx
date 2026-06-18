import { useEffect, useCallback } from 'react';
import { useAppStore } from '../../store';

export default function PhotoViewer() {
  const selectedFile = useAppStore((s) => s.selectedFile);
  const showViewer = useAppStore((s) => s.showViewer);
  const selectFile = useAppStore((s) => s.selectFile);
  const captions = useAppStore((s) => s.captions);

  const close = useCallback(() => {
    selectFile(null);
  }, [selectFile]);

  // ESC 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [close]);

  if (!showViewer || !selectedFile) return null;

  const isVideo = selectedFile.type === 'video';
  const caption = captions[String(selectedFile.id)];

  return (
    <div className="viewer-overlay" onClick={close}>
      <div className="viewer-card" onClick={(e) => e.stopPropagation()}>
        <button className="viewer-close" onClick={close}>
          ✕
        </button>

        {/* 媒体区域 */}
        <div className="viewer-media">
          {isVideo ? (
            <video
              src={import.meta.env.BASE_URL + selectedFile.path}
              controls
              autoPlay
              className="viewer-video"
              playsInline
            />
          ) : (
            <img
              src={import.meta.env.BASE_URL + selectedFile.path}
              alt={selectedFile.name}
              className="viewer-image"
              loading="eager"
            />
          )}
        </div>

        {/* 信息 */}
        <div className="viewer-info">
          <div className="viewer-name">{selectedFile.name.replace(/^微信图片_/, '📷 ')}</div>
          <div className="viewer-date">
            📅 {selectedFile.date}
          </div>
          <div className="viewer-type">
            {isVideo ? '🎬 视频' : '📷 照片'}
            <span style={{ marginLeft: 12, opacity: 0.6 }}>
              {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
            </span>
          </div>
          {caption && (
            <div className="viewer-caption">{caption}</div>
          )}
        </div>
      </div>
    </div>
  );
}
