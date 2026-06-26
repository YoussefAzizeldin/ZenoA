import { useEffect, useMemo, useState } from 'react'
import type {
  CreateTaskInput,
  EmailAnalysis,
  EmailMessage,
  EmailProviderStatus,
  EmailReplyDraft,
  TaskPriority,
  TaskSuggestion,
} from '../types'

type EmailTab = 'outlook' | 'manual'
type StatusMsg = { type: 'success' | 'error' | 'info'; text: string } | null

interface EmailCardState {
  message: EmailMessage
  analysis?: EmailAnalysis
  analyzing?: boolean
  error?: string
}

interface TaskDraft {
  title: string
  description: string
  priority: TaskPriority
  dueDate: string
  scheduledTime: string
  reminderAt: string
}

const providerLabel: Record<string, string> = {
  'outlook-desktop': 'Outlook Desktop',
  manual: 'Manual Import',
  'graph-future': 'Graph Future',
}

function toLocalInput(value?: string): string {
  if (!value) return ''
  return value.slice(0, 16)
}

function normalizeDateTime(value: string): string | undefined {
  if (!value) return undefined
  return value.length === 16 ? `${value}:00` : value
}

function defaultReminderFor(dueDate?: string, scheduledTime?: string): string {
  if (scheduledTime) return toLocalInput(scheduledTime)
  if (dueDate) return `${dueDate}T09:00`
  return ''
}

function draftFromSuggestion(suggestion: TaskSuggestion): TaskDraft {
  return {
    title: suggestion.title,
    description: suggestion.description,
    priority: suggestion.priority,
    dueDate: suggestion.dueDate || '',
    scheduledTime: toLocalInput(suggestion.scheduledTime),
    reminderAt: defaultReminderFor(suggestion.dueDate, suggestion.scheduledTime),
  }
}

function payloadFromSuggestion(suggestion: TaskSuggestion, draft?: TaskDraft): CreateTaskInput {
  const values = draft || draftFromSuggestion(suggestion)
  return {
    title: values.title,
    description: values.description,
    priority: values.priority,
    status: 'todo',
    dueDate: values.dueDate || undefined,
    scheduledTime: normalizeDateTime(values.scheduledTime),
    reminderAt: normalizeDateTime(values.reminderAt),
    source: 'email',
    linkedEmail: suggestion.linkedEmail,
  }
}

function signalText(analysis?: EmailAnalysis): string {
  if (!analysis) return ''
  const labels: Array<[keyof EmailAnalysis['signals'], string]> = [
    ['assignments', 'Assignment'],
    ['deadlines', 'Deadline'],
    ['meetings', 'Meeting'],
    ['requestedActions', 'Action'],
    ['urgentMessages', 'Urgent'],
  ]
  const active = labels.filter(([key]) => analysis.signals[key]).map(([, label]) => label)
  return active.length ? active.join(' / ') : 'No action signals'
}

export default function EmailPage() {
  const [tab, setTab] = useState<EmailTab>('outlook')
  const [providerStatuses, setProviderStatuses] = useState<EmailProviderStatus[]>([])
  const [emails, setEmails] = useState<EmailCardState[]>([])
  const [loading, setLoading] = useState<string | null>(null)
  const [status, setStatus] = useState<StatusMsg>(null)
  const [createdSuggestions, setCreatedSuggestions] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<TaskDraft | null>(null)
  const [replyDrafts, setReplyDrafts] = useState<Record<string, EmailReplyDraft>>({})
  const [replyBodies, setReplyBodies] = useState<Record<string, string>>({})
  const [manualForm, setManualForm] = useState({
    from: '',
    subject: '',
    body: '',
    receivedAt: '',
  })

  useEffect(() => {
    void loadProviders()
    void loadManualEmails()
  }, [])

  const manualEmails = useMemo(
    () => emails.filter(email => email.message.provider === 'manual').length,
    [emails]
  )

  const loadProviders = async () => {
    try {
      const statuses = await window.zeno.email.providers()
      setProviderStatuses(statuses)
    } catch (error) {
      setStatus({ type: 'error', text: String(error) })
    }
  }

  const loadManualEmails = async () => {
    const messages = await window.zeno.email.manual.list()
    if (messages.length) {
      setEmails(prev => [
        ...messages.map(message => ({ message })),
        ...prev.filter(item => item.message.provider !== 'manual'),
      ])
    }
  }

  const readOutlook = async (mode: 'recent' | 'unread') => {
    setLoading(mode)
    setStatus({ type: 'info', text: mode === 'recent' ? 'Reading recent Outlook email...' : 'Reading unread Outlook email...' })
    try {
      const result = mode === 'recent'
        ? await window.zeno.email.outlook.recent(10)
        : await window.zeno.email.outlook.unread(10)

      if (!result.success) {
        setStatus({ type: 'error', text: result.error || 'Outlook Desktop is not available.' })
        return
      }

      setEmails(result.messages.map(message => ({ message })))
      setStatus({ type: 'success', text: `Loaded ${result.messages.length} ${mode} email(s).` })
    } catch (error) {
      setStatus({ type: 'error', text: String(error) })
    } finally {
      setLoading(null)
    }
  }

  const analyzeEmail = async (message: EmailMessage) => {
    setEmails(prev => prev.map(item =>
      item.message.id === message.id ? { ...item, analyzing: true, error: undefined } : item
    ))
    try {
      const analysis = await window.zeno.email.analyze(message)
      setEmails(prev => prev.map(item =>
        item.message.id === message.id ? { ...item, analysis, analyzing: false } : item
      ))
    } catch (error) {
      setEmails(prev => prev.map(item =>
        item.message.id === message.id ? { ...item, analyzing: false, error: String(error) } : item
      ))
    }
  }

  const analyzeAll = async () => {
    for (const item of emails) {
      if (!item.analysis) await analyzeEmail(item.message)
    }
  }

  const importManual = async () => {
    setLoading('manual')
    setStatus({ type: 'info', text: 'Importing manual email...' })
    try {
      const message = await window.zeno.email.manual.import({
        from: manualForm.from,
        subject: manualForm.subject,
        body: manualForm.body,
        receivedAt: manualForm.receivedAt ? normalizeDateTime(manualForm.receivedAt) : undefined,
      })
      setEmails(prev => [{ message }, ...prev])
      setManualForm({ from: '', subject: '', body: '', receivedAt: '' })
      setStatus({ type: 'success', text: 'Manual email imported.' })
      await analyzeEmail(message)
    } catch (error) {
      setStatus({ type: 'error', text: String(error) })
    } finally {
      setLoading(null)
    }
  }

  const createTask = async (suggestion: TaskSuggestion, editedDraft?: TaskDraft) => {
    const payload = payloadFromSuggestion(suggestion, editedDraft)
    const result = await window.zeno.tasks.create(payload)
    if (result.success) {
      setCreatedSuggestions(prev => new Set(prev).add(suggestion.id))
      setEditingId(null)
      setDraft(null)
      setStatus({ type: 'success', text: `Task created: ${result.task.title}` })
    }
  }

  const startEdit = (suggestion: TaskSuggestion) => {
    setEditingId(suggestion.id)
    setDraft(draftFromSuggestion(suggestion))
  }

  const draftReply = async (message: EmailMessage) => {
    setLoading(`draft-${message.id}`)
    setStatus({ type: 'info', text: 'Drafting AI reply for approval...' })
    try {
      const replyDraft = await window.zeno.email.draftReply(message)
      setReplyDrafts(prev => ({ ...prev, [message.id]: replyDraft }))
      setReplyBodies(prev => ({ ...prev, [message.id]: replyDraft.body }))
      setStatus({ type: 'success', text: 'Reply drafted. Review and approve before sending.' })
    } catch (error) {
      setStatus({ type: 'error', text: String(error) })
    } finally {
      setLoading(null)
    }
  }

  const sendApprovedReply = async (message: EmailMessage) => {
    const body = replyBodies[message.id]?.trim()
    if (!body) {
      setStatus({ type: 'error', text: 'Reply body is empty.' })
      return
    }

    const ok = await window.zeno.confirm.dialog(
      'Send Outlook Reply',
      `Send this approved reply to ${message.from}?`
    )
    if (!ok) return

    setLoading(`send-${message.id}`)
    try {
      const result = await window.zeno.email.sendApprovedReply(message, body)
      if (!result.success) {
        setStatus({ type: 'error', text: result.error || 'Could not send Outlook reply.' })
        return
      }
      setStatus({ type: 'success', text: `Approved reply sent to ${message.from}.` })
      setReplyDrafts(prev => {
        const next = { ...prev }
        delete next[message.id]
        return next
      })
      setReplyBodies(prev => {
        const next = { ...prev }
        delete next[message.id]
        return next
      })
    } catch (error) {
      setStatus({ type: 'error', text: String(error) })
    } finally {
      setLoading(null)
    }
  }

  const ProviderStrip = () => (
    <div className="email-provider-strip">
      {providerStatuses.map(provider => (
        <div key={provider.provider} className={`email-provider-pill ${provider.available ? 'ok' : 'muted'}`} title={provider.message}>
          <span className={`status-dot ${provider.available ? 'connected' : 'disconnected'}`} />
          {providerLabel[provider.provider]}
        </div>
      ))}
    </div>
  )

  const SuggestionCard = ({ suggestion }: { suggestion: TaskSuggestion }) => {
    const isEditing = editingId === suggestion.id
    const isCreated = createdSuggestions.has(suggestion.id)
    return (
      <div className="task-suggestion-card">
        <div className="task-suggestion-top">
          <div>
            <div className="task-suggestion-title">{suggestion.title}</div>
            <div className="task-suggestion-meta">
              {suggestion.priority.toUpperCase()}
              {suggestion.dueDate ? ` / Due ${suggestion.dueDate}` : ''}
            </div>
          </div>
          {isCreated && <span className="badge badge-new">CREATED</span>}
        </div>

        {!isEditing ? (
          <>
            <p className="email-text-block selectable">{suggestion.description}</p>
            {suggestion.reminderSuggestions.length > 0 && (
              <div className="email-chip-row">
                {suggestion.reminderSuggestions.map(reminder => (
                  <span key={reminder} className="email-chip">{reminder}</span>
                ))}
              </div>
            )}
            <div className="btn-row">
              <button className="btn btn-primary btn-sm" disabled={isCreated} onClick={() => createTask(suggestion)}>
                Create Task
              </button>
              <button className="btn btn-secondary btn-sm" disabled={isCreated} onClick={() => startEdit(suggestion)}>
                Edit Before Creating
              </button>
            </div>
          </>
        ) : draft && (
          <div className="email-edit-grid">
            <input className="form-input" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} />
            <textarea className="form-input" rows={4} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} />
            <div className="form-row">
              <select className="form-select" value={draft.priority} onChange={e => setDraft({ ...draft, priority: e.target.value as TaskPriority })}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
              <input className="form-input" type="date" value={draft.dueDate} onChange={e => setDraft({ ...draft, dueDate: e.target.value })} />
              <input className="form-input" type="datetime-local" value={draft.scheduledTime} onChange={e => setDraft({ ...draft, scheduledTime: e.target.value })} />
              <input className="form-input" type="datetime-local" value={draft.reminderAt} onChange={e => setDraft({ ...draft, reminderAt: e.target.value })} />
            </div>
            <div className="btn-row">
              <button className="btn btn-primary btn-sm" onClick={() => createTask(suggestion, draft)}>Save Task</button>
              <button className="btn btn-secondary btn-sm" onClick={() => { setEditingId(null); setDraft(null) }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  const EmailCard = ({ item }: { item: EmailCardState }) => {
    const replyDraft = replyDrafts[item.message.id]
    const canSendReply = item.message.provider === 'outlook-desktop' && !!item.message.externalId
    return (
      <div className="email-card">
        <div className="email-card-header">
          <div>
            <div className="email-subject">{item.message.subject}</div>
            <div className="email-from">{item.message.from}</div>
          </div>
          <div className="email-meta">
            {item.message.isUnread && <span className="badge badge-new">UNREAD</span>}
            <span>{item.message.receivedAt ? new Date(item.message.receivedAt).toLocaleString() : providerLabel[item.message.provider]}</span>
          </div>
        </div>

        <div className="email-body-preview selectable">{item.message.body || 'No body text.'}</div>

        <div className="btn-row">
          <button className="btn btn-secondary btn-sm" disabled={!!item.analyzing} onClick={() => analyzeEmail(item.message)}>
            {item.analyzing ? 'Analyzing...' : item.analysis ? 'Re-analyze' : 'Analyze'}
          </button>
          <button
            className="btn btn-secondary btn-sm"
            disabled={!canSendReply || loading === `draft-${item.message.id}`}
            onClick={() => draftReply(item.message)}
            title={canSendReply ? 'Draft a reply for approval' : 'Reply sending is available only for Outlook Desktop emails'}
          >
            {loading === `draft-${item.message.id}` ? 'Drafting...' : 'Draft Reply'}
          </button>
          {item.analysis && <span className="email-signal-label">{signalText(item.analysis)}</span>}
        </div>

        {item.error && <div className="conn-status error">{item.error}</div>}

        {replyDraft && (
          <div className="email-reply-panel">
            <div className="section-header">Approved Send Required</div>
            <div className="email-reply-meta">To: {replyDraft.to} / {replyDraft.subject}</div>
            <textarea
              className="form-input"
              rows={7}
              value={replyBodies[item.message.id] || ''}
              onChange={e => setReplyBodies(prev => ({ ...prev, [item.message.id]: e.target.value }))}
            />
            <div className="btn-row">
              <button
                className="btn btn-primary btn-sm"
                disabled={loading === `send-${item.message.id}`}
                onClick={() => sendApprovedReply(item.message)}
              >
                {loading === `send-${item.message.id}` ? 'Sending...' : 'Send Approved Reply'}
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setReplyDrafts(prev => {
                    const next = { ...prev }
                    delete next[item.message.id]
                    return next
                  })
                  setReplyBodies(prev => {
                    const next = { ...prev }
                    delete next[item.message.id]
                    return next
                  })
                }}
              >
                Cancel Draft
              </button>
            </div>
          </div>
        )}

        {item.analysis && (
          <div className="email-analysis-panel">
            <div className="section-header">Summary</div>
            <p className="email-text-block selectable">{item.analysis.summary}</p>
            <div className="section-header" style={{ marginTop: 14 }}>Suggested Tasks</div>
            {item.analysis.suggestions.length === 0 ? (
              <div className="empty-state-sm">No task suggestions found.</div>
            ) : (
              <div className="task-suggestion-list">
                {item.analysis.suggestions.map(suggestion => (
                  <SuggestionCard key={suggestion.id} suggestion={suggestion} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Email</h1>
          <p className="page-subtitle">Local email intake and task approval</p>
        </div>
        <button className="btn btn-secondary btn-sm" disabled={emails.length === 0 || !!loading} onClick={analyzeAll}>
          Analyze All
        </button>
      </div>

      <ProviderStrip />

      <div className="settings-tabs">
        <button className={`settings-tab ${tab === 'outlook' ? 'active' : ''}`} onClick={() => setTab('outlook')}>Outlook Desktop</button>
        <button className={`settings-tab ${tab === 'manual' ? 'active' : ''}`} onClick={() => setTab('manual')}>Manual Import</button>
      </div>

      {status && <div className={`conn-status ${status.type}`}>{status.text}</div>}

      {tab === 'outlook' && (
        <div className="email-toolbar">
          <button className="btn btn-primary btn-sm" disabled={!!loading} onClick={() => readOutlook('recent')}>
            {loading === 'recent' ? 'Reading...' : 'Read Recent'}
          </button>
          <button className="btn btn-secondary btn-sm" disabled={!!loading} onClick={() => readOutlook('unread')}>
            {loading === 'unread' ? 'Reading...' : 'Read Unread'}
          </button>
        </div>
      )}

      {tab === 'manual' && (
        <div className="manual-import-panel">
          <div className="form-row">
            <input className="form-input" value={manualForm.from} onChange={e => setManualForm({ ...manualForm, from: e.target.value })} placeholder="Sender" />
            <input className="form-input" value={manualForm.subject} onChange={e => setManualForm({ ...manualForm, subject: e.target.value })} placeholder="Subject" />
            <input className="form-input" type="datetime-local" value={manualForm.receivedAt} onChange={e => setManualForm({ ...manualForm, receivedAt: e.target.value })} />
          </div>
          <textarea
            className="form-input"
            rows={7}
            value={manualForm.body}
            onChange={e => setManualForm({ ...manualForm, body: e.target.value })}
            placeholder="Paste email body"
          />
          <div className="btn-row">
            <button className="btn btn-primary btn-sm" disabled={loading === 'manual'} onClick={importManual}>
              {loading === 'manual' ? 'Importing...' : 'Import and Analyze'}
            </button>
            <span className="email-signal-label">{manualEmails} manual email(s)</span>
          </div>
        </div>
      )}

      <div className="email-list">
        {emails.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">@</div>
            <div className="empty-state-title">No email loaded</div>
            <div className="empty-state-sub">Read Outlook Desktop email or import one manually.</div>
          </div>
        ) : (
          emails.map(item => <EmailCard key={item.message.id} item={item} />)
        )}
      </div>
    </div>
  )
}
