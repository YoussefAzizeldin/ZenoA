import { useEffect, useState } from 'react'
import { useAppStore } from '../store/appStore'
import type { LogEntry } from '../types'
import { format } from 'date-fns'

function formatTime(iso: string): string {
  try { return format(new Date(iso), 'HH:mm:ss') } catch { return iso }
}
function formatDate(iso: string): string {
  try { return format(new Date(iso), 'MMM d') } catch { return '' }
}

const ACTION_SHORT: Record<string, string> = {
  NOTE_READ: 'READ', NOTE_CREATE: 'CREATE', NOTE_EDIT: 'EDIT',
  NOTE_DELETE: 'DELETE', NOTE_RENAME: 'RENAME', NOTE_MOVE: 'MOVE',
  VAULT_SEARCH: 'SEARCH', MEMORY_SAVE: 'MEMORY',
  LM_CALL: 'LM CALL', LM_ERROR: 'LM ERR',
  CONNECTION_TEST: 'TEST', PERMISSION_REQUEST: 'PERM?',
  PERMISSION_APPROVED: 'APPROVED', PERMISSION_DENIED: 'DENIED',
  SYSTEM: 'SYSTEM', PROVIDER_SWITCH: 'PROVIDER',
  CLAUDE_CALL: 'CLAUDE', CLAUDE_ERROR: 'CL ERR',
  CLAUDE_CONTEXT_REQUESTED: 'CTX?', CLAUDE_CONTEXT_APPROVED: 'CTX OK',
  CLAUDE_CONTEXT_DENIED: 'CTX NO',
  WHATSAPP_CONNECTED: 'WA ON', WHATSAPP_DISCONNECTED: 'WA OFF',
  WHATSAPP_QR: 'WA QR', WHATSAPP_MENU_SENT: 'WA MENU',
  WHATSAPP_CHAT_START: 'WA CHAT', WHATSAPP_CHAT_END: 'WA END',
  WHATSAPP_REQUEST_CREATED: 'WA REQ', WHATSAPP_REQUEST_COMPLETED: 'WA DONE',
  WHATSAPP_REQUEST_IGNORED: 'WA IGN', WHATSAPP_CLAUDE_CALL: 'WA CL',
  WHATSAPP_LM_CALL: 'WA LM', WHATSAPP_LM_ERROR: 'WA LM ERR',
  BRIDGE_COMMAND: 'BRIDGE', BRIDGE_SUCCESS: 'BR OK', BRIDGE_FAILED: 'BR ERR',
  EMAIL_READ: 'EMAIL',
  EMAIL_IMPORT: 'IMPORT',
  EMAIL_ANALYZED: 'ANALYZE',
  EMAIL_TASK_SUGGESTED: 'SUGGEST',
  EMAIL_REPLY_DRAFTED: 'DRAFT',
  EMAIL_REPLY_SENT: 'SENT',
  EMAIL_PROVIDER_ERROR: 'EM ERR',
  TASK_CREATED: 'TASK+',
  TASK_UPDATED: 'TASK',
  TASK_DELETED: 'TASK-',
  TASK_SCHEDULED: 'SCHED',
  TASK_REMINDER_SENT: 'REMIND',
  TASK_ERROR: 'TASK ERR',
}

const CATEGORIES = ['ALL', 'EMAIL', 'TASKS', 'OBSIDIAN', 'CLAUDE', 'WHATSAPP', 'SYSTEM', 'BRIDGE']

function LogRow({ entry }: { entry: LogEntry }) {
  const short = ACTION_SHORT[entry.actionType] || entry.actionType.replace(/_/g, ' ')
  return (
    <div className={`log-entry ${entry.success ? '' : 'failed'}`}>
      <div>
        <div className="log-time">{formatDate(entry.timestamp)}</div>
        <div className="log-time">{formatTime(entry.timestamp)}</div>
      </div>
      <div>
        <span className={`log-type-badge badge-${entry.actionType}`}>{short}</span>
      </div>
      <div>
        <div className="log-desc">{entry.description}</div>
        {entry.filePath && (
          <div className="log-filepath">↳ {entry.filePath}</div>
        )}
        {entry.sender && (
          <div className="log-filepath" style={{ color: 'var(--accent-bright)' }}>
            ↳ {entry.sender}
          </div>
        )}
        {entry.detail && (
          <div className="log-filepath" style={{ color: 'var(--error)', marginTop: 2 }}>
            {entry.detail}
          </div>
        )}
      </div>
      <div className="log-status">
        {entry.success
          ? <span className="log-success">✓</span>
          : <span className="log-fail">✗</span>
        }
      </div>
    </div>
  )
}

export default function ActivityLogPage() {
  const { logEntries, setLogEntries } = useAppStore()
  const [category, setCategory] = useState('ALL')
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    handleRefresh()
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const entries = await window.zeno.activityLog.get()
      setLogEntries(entries)
    } finally {
      setRefreshing(false)
    }
  }

  const handleClear = async () => {
    const confirmed = await window.zeno.confirm.dialog(
      'Clear Activity Log',
      'This will permanently delete all activity log entries.'
    )
    if (confirmed) {
      await window.zeno.activityLog.clear()
      setLogEntries([])
    }
  }

  const filtered = category === 'ALL'
    ? logEntries
    : logEntries.filter(e => {
        const cat = e.category?.toUpperCase() || e.actionType.toUpperCase()
        return cat.includes(category)
      })

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Activity Log</h1>
          <p className="page-subtitle">All system events and actions</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
            {filtered.length} entries
          </span>
          <button className="btn btn-secondary btn-sm" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? '…' : '↻ Refresh'}
          </button>
          <button className="btn btn-danger btn-sm" onClick={handleClear} disabled={logEntries.length === 0}>
            Clear
          </button>
        </div>
      </div>

      {/* Category filter */}
      <div className="log-filter-bar">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            className={`log-filter-btn ${category === cat ? 'active' : ''}`}
            onClick={() => setCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">◎</div>
          <div className="empty-state-title">No activity recorded</div>
          <div className="empty-state-sub">Events will appear here as you use Zeno.</div>
        </div>
      ) : (
        <div className="log-list">
          {[...filtered].reverse().map(entry => (
            <LogRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  )
}
