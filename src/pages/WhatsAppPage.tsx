import { useState, useEffect } from 'react'
import * as QRCode from 'qrcode'
import { useAppStore } from '../store/appStore'
import type { ZenoSettings, WhatsAppScheduleItem } from '../types'

export default function WhatsAppPage() {
  const { settings, setSettings, connection, whatsappQR, setWhatsappQR } = useAppStore()
  const [saving, setSaving] = useState(false)
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [form, setForm] = useState<Partial<ZenoSettings>>({})
  const [newScheduleItem, setNewScheduleItem] = useState('')
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null)
  const [qrRenderError, setQrRenderError] = useState<string | null>(null)

  useEffect(() => {
    if (settings) {
      setForm({
        whatsappEnabled: settings.whatsappEnabled,
        whatsappAutoReply: settings.whatsappAutoReply,
        whatsappBusyScript: settings.whatsappBusyScript,
        whatsappZenoDescription: settings.whatsappZenoDescription,
        whatsappScheduleItems: settings.whatsappScheduleItems || [],
      })
    }
  }, [settings])

  useEffect(() => {
    let cancelled = false
    if (!whatsappQR) { setQrImageUrl(null); setQrRenderError(null); return }
    if (whatsappQR.startsWith('data:image/')) { setQrImageUrl(whatsappQR); return }
    QRCode.toDataURL(whatsappQR, { errorCorrectionLevel: 'M', margin: 2, width: 260, color: { dark: '#111827', light: '#ffffff' } })
      .then(url => { if (!cancelled) { setQrImageUrl(url); setQrRenderError(null) } })
      .catch(() => { if (!cancelled) { setQrImageUrl(null); setQrRenderError('Could not render QR. Try reconnecting.') } })
    return () => { cancelled = true }
  }, [whatsappQR])

  const update = <K extends keyof ZenoSettings>(key: K, value: ZenoSettings[K]) =>
    setForm(prev => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await window.zeno.settings.save(form)
      if (settings) setSettings({ ...settings, ...form } as ZenoSettings)
      setStatusMsg({ type: 'success', text: 'Settings saved.' })
    } catch (e) {
      setStatusMsg({ type: 'error', text: String(e) })
    } finally {
      setSaving(false)
    }
  }

  const handleConnect = async () => {
    setStatusMsg({ type: 'info', text: 'Starting WhatsApp… this may take 30–60 seconds.' })
    const result = await window.zeno.whatsapp.init()
    if (!result.success) setStatusMsg({ type: 'error', text: result.error || 'Failed to start WhatsApp' })
    else setStatusMsg({ type: 'info', text: 'Initializing… scan the QR when it appears.' })
  }

  const handleLogout = async () => {
    const ok = await window.zeno.confirm.dialog('Reset WhatsApp Session', 'This will log out and delete the saved session. You will need to scan QR again.')
    if (!ok) return
    await window.zeno.whatsapp.logout()
    setWhatsappQR(null)
    setStatusMsg({ type: 'info', text: 'Session cleared. You can reconnect now.' })
  }

  const handleDisconnect = async () => {
    await window.zeno.whatsapp.destroy()
    setWhatsappQR(null)
    setStatusMsg({ type: 'info', text: 'WhatsApp disconnected.' })
  }

  const scheduleItems: WhatsAppScheduleItem[] = (form.whatsappScheduleItems as WhatsAppScheduleItem[]) || []

  const addScheduleItem = () => {
    if (!newScheduleItem.trim()) return
    update('whatsappScheduleItems', [...scheduleItems, { id: `si-${Date.now()}`, text: newScheduleItem.trim(), active: true }])
    setNewScheduleItem('')
  }

  const waStatus = connection.whatsapp
  const statusLabel =
    waStatus === 'connected' ? 'Connected' :
    waStatus === 'qr_pending' ? 'Scan QR to log in' :
    waStatus === 'initializing' ? 'Starting…' :
    waStatus === 'error' ? 'Error' : 'Disconnected'

  const statusDotClass =
    waStatus === 'connected' ? 'connected' :
    waStatus === 'qr_pending' || waStatus === 'initializing' ? 'checking' : 'disconnected'

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">WhatsApp</h1>
        <p className="page-subtitle">Automated messaging and integration settings</p>
      </div>

      <div className="page-two-col">
        {/* Left column: Connection + QR */}
        <div className="page-col">
          <div className="card">
            <div className="card-header">Connection</div>
            <div className="card-body">
              <div className="wa-status-row">
                <div className={`status-dot ${statusDotClass}`} />
                <span className="wa-status-text">{statusLabel}</span>
              </div>

              <div className="btn-row">
                {(waStatus === 'disconnected' || waStatus === 'disabled') && (
                  <button className="btn btn-primary btn-sm" onClick={handleConnect}>Connect</button>
                )}
                {waStatus === 'connected' && (
                  <button className="btn btn-secondary btn-sm" onClick={handleDisconnect}>Disconnect</button>
                )}
                <button className="btn btn-secondary btn-sm" onClick={handleLogout}>Reset Session</button>
              </div>

              {statusMsg && (
                <div className={`conn-status ${statusMsg.type}`} style={{ marginTop: 12 }}>{statusMsg.text}</div>
              )}
            </div>
          </div>

          {whatsappQR && (
            <div className="card">
              <div className="card-header">Scan QR Code</div>
              <div className="card-body" style={{ textAlign: 'center' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 14 }}>
                  Open WhatsApp on your phone → Linked Devices → Scan QR
                </p>
                <div className="wa-qr-box">
                  {qrImageUrl ? (
                    <img className="wa-qr-image" src={qrImageUrl} alt="WhatsApp QR" />
                  ) : (
                    <span style={{ color: '#374151', fontSize: 12 }}>
                      {qrRenderError || 'Preparing QR code…'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-header">Enable</div>
            <div className="card-body">
              <label className="toggle-row">
                <span className="form-label" style={{ margin: 0 }}>Enable WhatsApp integration</span>
                <input type="checkbox" checked={!!form.whatsappEnabled} onChange={e => update('whatsappEnabled', e.target.checked)} />
              </label>
              <div style={{ marginTop: 12 }}>
                <label className="toggle-row">
                  <span className="form-label" style={{ margin: 0 }}>Auto-send busy script on new message</span>
                  <input type="checkbox" checked={!!form.whatsappAutoReply} onChange={e => update('whatsappAutoReply', e.target.checked)} />
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Right column: Scripts + Schedule */}
        <div className="page-col">
          <div className="card">
            <div className="card-header">Busy Script (Menu Message)</div>
            <div className="card-body">
              <p className="form-hint">Sent automatically when someone messages you while busy.</p>
              <textarea
                className="form-input"
                value={form.whatsappBusyScript as string || ''}
                onChange={e => update('whatsappBusyScript', e.target.value)}
                rows={8}
                style={{ resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 12 }}
              />
            </div>
          </div>

          <div className="card">
            <div className="card-header">Zeno Description (Option 1)</div>
            <div className="card-body">
              <p className="form-hint">Sent when user selects "Who/What is Zeno".</p>
              <textarea
                className="form-input"
                value={form.whatsappZenoDescription as string || ''}
                onChange={e => update('whatsappZenoDescription', e.target.value)}
                rows={3}
                style={{ resize: 'vertical' }}
              />
            </div>
          </div>

          <div className="card">
            <div className="card-header">Schedule / Status (Option 2)</div>
            <div className="card-body">
              <p className="form-hint">Shown when user selects "What is on your schedule".</p>
              <div className="form-row" style={{ marginBottom: 10 }}>
                <input
                  className="form-input"
                  value={newScheduleItem}
                  onChange={e => setNewScheduleItem(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addScheduleItem() } }}
                  placeholder="e.g. Studying for exams"
                />
                <button className="btn btn-primary btn-sm" onClick={addScheduleItem}>Add</button>
              </div>
              {scheduleItems.length === 0 && (
                <div className="empty-state-sm">No items. Add status updates above.</div>
              )}
              <div className="schedule-list">
                {scheduleItems.map(item => (
                  <div key={item.id} className="schedule-item">
                    <input type="checkbox" checked={item.active}
                      onChange={() => update('whatsappScheduleItems', scheduleItems.map(i => i.id === item.id ? { ...i, active: !i.active } : i))} />
                    <span style={{ flex: 1, opacity: item.active ? 1 : 0.4 }}>{item.text}</span>
                    <button className="btn-icon" onClick={() => update('whatsappScheduleItems', scheduleItems.filter(i => i.id !== item.id))}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="page-actions">
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
