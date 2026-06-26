import { useAppStore } from '../store/appStore'

export default function SystemStatusPopup() {
  const { setShowSystemStatus, connection } = useAppStore()
  const { lmStudio, obsidian, whatsapp, claude, bridge, currentModel, activeProvider } = connection

  const StatusRow = ({
    label,
    value,
    valueColor,
    dot,
  }: {
    label: string
    value: string
    valueColor: string
    dot: 'green' | 'yellow' | 'red' | 'gray'
  }) => {
    const dotColor = {
      green: 'var(--success)',
      yellow: 'var(--warning)',
      red: 'var(--error)',
      gray: 'var(--text-muted)',
    }[dot]

    return (
      <div className="syspop-row">
        <div className="syspop-dot" style={{ background: dotColor, boxShadow: `0 0 5px ${dotColor}` }} />
        <span className="syspop-label">{label}</span>
        <span className="syspop-value" style={{ color: valueColor }}>{value}</span>
      </div>
    )
  }

  return (
    <>
      <div className="syspop-backdrop" onClick={() => setShowSystemStatus(false)} />
      <div className="syspop">
        <div className="syspop-header">
          <span className="syspop-title">SYSTEM STATUS</span>
          <button className="syspop-close" onClick={() => setShowSystemStatus(false)}>✕</button>
        </div>

        <div className="syspop-body">
          <StatusRow
            label="Active Provider"
            value={activeProvider === 'claude' ? 'Claude API' : 'LM Studio'}
            valueColor={activeProvider === 'claude' ? '#a78bfa' : 'var(--text-primary)'}
            dot="green"
          />

          <StatusRow
            label="LM Studio"
            value={
              lmStudio === 'connected' ? 'Online' :
              lmStudio === 'checking' ? 'Checking…' : 'Offline'
            }
            valueColor={lmStudio === 'connected' ? 'var(--success)' : lmStudio === 'checking' ? 'var(--warning)' : 'var(--error)'}
            dot={lmStudio === 'connected' ? 'green' : lmStudio === 'checking' ? 'yellow' : 'red'}
          />

          <StatusRow
            label="Claude API"
            value={claude === 'configured' ? 'Configured' : 'Not configured'}
            valueColor={claude === 'configured' ? 'var(--success)' : 'var(--text-muted)'}
            dot={claude === 'configured' ? 'green' : 'gray'}
          />

          <StatusRow
            label="Obsidian Vault"
            value={
              obsidian === 'found' ? 'Found' :
              obsidian === 'checking' ? 'Checking…' : 'Not found'
            }
            valueColor={obsidian === 'found' ? 'var(--success)' : obsidian === 'checking' ? 'var(--warning)' : 'var(--error)'}
            dot={obsidian === 'found' ? 'green' : obsidian === 'checking' ? 'yellow' : 'red'}
          />

          <StatusRow
            label="WhatsApp"
            value={
              whatsapp === 'connected' ? 'Connected' :
              whatsapp === 'qr_pending' ? 'Scan QR' :
              whatsapp === 'initializing' ? 'Starting…' :
              whatsapp === 'disabled' ? 'Disabled' : 'Disconnected'
            }
            valueColor={
              whatsapp === 'connected' ? 'var(--success)' :
              whatsapp === 'qr_pending' ? 'var(--warning)' :
              'var(--text-muted)'
            }
            dot={whatsapp === 'connected' ? 'green' : whatsapp === 'qr_pending' || whatsapp === 'initializing' ? 'yellow' : 'gray'}
          />

          {bridge !== 'disabled' && (
            <StatusRow
              label="PC Bridge"
              value={bridge === 'connected' ? 'Connected' : 'Disconnected'}
              valueColor={bridge === 'connected' ? 'var(--success)' : 'var(--text-muted)'}
              dot={bridge === 'connected' ? 'green' : 'gray'}
            />
          )}

          {currentModel && (
            <div className="syspop-model">
              <span className="syspop-label">Model</span>
              <span className="syspop-modelname" title={currentModel}>{currentModel}</span>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
