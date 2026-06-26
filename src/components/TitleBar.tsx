import { useAppStore } from '../store/appStore'
import zenoLogo from '../assets/zeno-logo.png'

export default function TitleBar() {
  const { showSystemStatus, setShowSystemStatus, connection } = useAppStore()

  const handleMinimize = () => window.zeno.window.minimize()
  const handleMaximize = () => window.zeno.window.maximize()
  const handleClose = () => window.zeno.window.close()

  // Derive overall health dot
  const allOk = connection.lmStudio === 'connected' || connection.activeProvider === 'claude'
  const healthColor = allOk ? 'var(--success)' : 'var(--warning)'

  return (
    <div className="title-bar">
      <div className="title-bar-left">
        {/* System status button */}
        <button
          className={`sys-status-btn ${showSystemStatus ? 'active' : ''}`}
          onClick={() => setShowSystemStatus(!showSystemStatus)}
          title="System Status"
        >
          <span className="sys-status-dot" style={{ background: healthColor }} />
          <span className="sys-status-label">SYSTEM</span>
        </button>

        <div className="title-bar-divider" />

        <span className="title-bar-logo" aria-label="Zeno">
          <img className="title-bar-logo-mark" src={zenoLogo} alt="" aria-hidden="true" />
          <span>ZENO</span>
        </span>
        <span className="title-bar-sub">PERSONAL AI SYSTEM</span>

        {/* Claude mode badge */}
        {connection.activeProvider === 'claude' && (
          <span className="claude-mode-badge">CLAUDE MODE</span>
        )}
      </div>

      <div className="title-bar-controls">
        <button className="win-btn" onClick={handleMinimize} title="Minimize">─</button>
        <button className="win-btn maximize" onClick={handleMaximize} title="Maximize">□</button>
        <button className="win-btn close" onClick={handleClose} title="Close">✕</button>
      </div>
    </div>
  )
}
