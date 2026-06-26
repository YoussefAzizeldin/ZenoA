import { useState } from 'react'
import { useAppStore } from '../store/appStore'
import type { WhatsAppRequest } from '../types'

function urgencyColor(urgency: string) {
  if (urgency === 'Emergency') return 'var(--error)'
  if (urgency === 'As soon as possible') return '#f97316'
  if (urgency === 'Today') return 'var(--warning)'
  return 'var(--text-muted)'
}

function urgencyIcon(urgency: string) {
  if (urgency === 'Emergency') return '🚨'
  if (urgency === 'As soon as possible') return '⚡'
  if (urgency === 'Today') return '📅'
  return '●'
}

export default function WhatsAppRequestsPage() {
  const { whatsappRequests, removeWhatsappRequest } = useAppStore()
  const [loading, setLoading] = useState<string | null>(null)

  const activeRequests = whatsappRequests.filter(r => r.status === 'new')

  const handleAction = async (req: WhatsAppRequest, action: 'complete' | 'ignore') => {
    setLoading(req.id)
    try {
      await window.zeno.whatsapp.requests.action(req.id, action)
      removeWhatsappRequest(req.id)
    } catch (e) {
      console.error('Request action failed:', e)
    } finally {
      setLoading(null)
    }
  }

  const formatTime = (iso: string) => {
    try { return new Date(iso).toLocaleString() } catch { return iso }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">WhatsApp Requests</h1>
          <p className="page-subtitle">Incoming requests from your contacts</p>
        </div>
        {activeRequests.length > 0 && (
          <div className="page-header-badge">{activeRequests.length} pending</div>
        )}
      </div>

      {activeRequests.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">✓</div>
          <div className="empty-state-title">All clear</div>
          <div className="empty-state-sub">No pending WhatsApp requests</div>
        </div>
      ) : (
        <div className="wa-requests-list">
          {activeRequests.map(req => (
            <div key={req.id} className="wa-request-card">
              <div className="wa-request-header">
                <div className="wa-request-sender">
                  <span className="wa-request-name">{req.senderName}</span>
                  <span className="wa-request-number">{req.senderNumber}</span>
                </div>
                <div className="wa-request-urgency" style={{ color: urgencyColor(req.urgency) }}>
                  {urgencyIcon(req.urgency)} {req.urgency}
                </div>
              </div>

              <div className="wa-request-body">
                <div className="wa-request-row">
                  <span className="wa-label">Topic</span>
                  <span>{req.topic}</span>
                </div>
                <div className="wa-request-row">
                  <span className="wa-label">Message</span>
                  <span>{req.message}</span>
                </div>
                <div className="wa-request-row">
                  <span className="wa-label">Prefers</span>
                  <span>{req.responsePref}</span>
                </div>
                <div className="wa-request-row">
                  <span className="wa-label">Received</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{formatTime(req.timestamp)}</span>
                </div>
              </div>

              <div className="wa-request-footer">
                <span className="badge badge-new">NEW</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={loading === req.id}
                    onClick={() => handleAction(req, 'complete')}
                  >
                    ✓ Complete
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={loading === req.id}
                    onClick={() => handleAction(req, 'ignore')}
                  >
                    Ignore
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
