export default function LoadingScreen() {
  return (
    <div style={{
      width: '100vw', height: '100vh',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#04050a',
      fontFamily: "'Noto Sans SC', sans-serif",
    }}>
      <div style={{ fontSize: 28, color: '#ffd27a', letterSpacing: '0.15em' }}>
        过去 · 现在
      </div>
      <div style={{ marginTop: 12, color: '#8b93a7', fontSize: 14 }}>
        正在加载照片星空...
      </div>
    </div>
  );
}
