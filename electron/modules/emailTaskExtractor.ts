import { ActivityLog } from './activityLog'
import { ClaudeClient } from './claudeClient'
import { LMStudioClient } from './lmStudioClient'
import { ZenoSettings } from '../settings'
import {
  EmailAnalysis,
  EmailMessage,
  EmailSignals,
  EmailSourceMetadata,
  TaskPriority,
  TaskSuggestion,
} from './emailTypes'

interface RawSuggestion {
  title?: string
  description?: string
  priority?: string
  dueDate?: string
  scheduledTime?: string
  reminderSuggestions?: string[]
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizePriority(priority?: string): TaskPriority {
  const lower = priority?.toLowerCase()
  if (lower === 'urgent' || lower === 'high' || lower === 'medium' || lower === 'low') return lower
  return 'medium'
}

function sourceMetadata(email: EmailMessage): EmailSourceMetadata {
  return {
    provider: email.provider,
    emailId: email.id,
    externalId: email.externalId,
    from: email.from,
    subject: email.subject,
    receivedAt: email.receivedAt,
  }
}

export class EmailTaskExtractor {
  constructor(
    private readonly getLmClient: () => LMStudioClient,
    private readonly claude: ClaudeClient,
    private readonly getSettings: () => ZenoSettings,
    private readonly log: ActivityLog
  ) {}

  async extract(email: EmailMessage, summary: string): Promise<Omit<EmailAnalysis, 'summary'>> {
    const signals = this.detectSignals(email)
    const llmSuggestions = await this.extractWithProvider(email, summary)
    const suggestions = llmSuggestions.length > 0
      ? llmSuggestions.map(raw => this.normalizeSuggestion(raw, email))
      : this.extractWithHeuristics(email, signals)

    if (suggestions.length > 0) {
      this.log.log('EMAIL_TASK_SUGGESTED', `Found ${suggestions.length} task suggestion(s): ${email.subject}`, true, undefined, undefined, email.from)
    }

    return { emailId: email.id, signals, suggestions }
  }

  private async extractWithProvider(email: EmailMessage, summary: string): Promise<RawSuggestion[]> {
    const settings = this.getSettings()
    const system = 'Extract task suggestions from email. Return only valid JSON. Do not create tasks and do not draft replies.'
    const prompt = `Today is ${new Date().toISOString().slice(0, 10)}.

Email:
From: ${email.from}
Subject: ${email.subject}
Received: ${email.receivedAt || 'Unknown'}
Summary:
${summary}

Body:
${email.body}

Return JSON exactly in this shape:
{
  "suggestions": [
    {
      "title": "short task title",
      "description": "task details",
      "priority": "low|medium|high|urgent",
      "dueDate": "YYYY-MM-DD or empty",
      "scheduledTime": "YYYY-MM-DDTHH:mm:00 or empty",
      "reminderSuggestions": ["plain language reminder suggestion"]
    }
  ]
}
Return an empty suggestions array if there is no requested action.`

    try {
      let content = ''
      if (settings.activeProvider === 'claude' && settings.claudeEnabled && this.claude.isConfigured()) {
        const result = await this.claude.chat(system, [{ role: 'user', content: prompt }], 800)
        content = result.success ? result.content || '' : ''
      } else {
        const result = await this.getLmClient().chatCompletion([
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ], settings.temperature, 800)
        content = result.success ? result.content || '' : ''
      }
      return this.parseSuggestions(content)
    } catch (error) {
      this.log.log('EMAIL_PROVIDER_ERROR', `Task extraction failed: ${String(error)}`, false)
      return []
    }
  }

  private parseSuggestions(content: string): RawSuggestion[] {
    if (!content.trim()) return []
    const start = content.indexOf('{')
    const end = content.lastIndexOf('}')
    if (start < 0 || end < start) return []

    try {
      const parsed = JSON.parse(content.slice(start, end + 1))
      return Array.isArray(parsed.suggestions) ? parsed.suggestions : []
    } catch {
      return []
    }
  }

  private normalizeSuggestion(raw: RawSuggestion, email: EmailMessage): TaskSuggestion {
    const title = raw.title?.trim() || `Follow up: ${email.subject || email.from}`
    const reminderSuggestions = Array.isArray(raw.reminderSuggestions)
      ? raw.reminderSuggestions.filter(Boolean).slice(0, 4)
      : []
    return {
      id: makeId('suggestion'),
      title,
      description: raw.description?.trim() || `Review email from ${email.from}: ${email.subject}`,
      priority: normalizePriority(raw.priority),
      dueDate: raw.dueDate || undefined,
      scheduledTime: raw.scheduledTime || undefined,
      reminderSuggestions,
      source: 'email',
      linkedEmail: sourceMetadata(email),
    }
  }

  private extractWithHeuristics(email: EmailMessage, signals: EmailSignals): TaskSuggestion[] {
    if (!signals.assignments && !signals.deadlines && !signals.meetings && !signals.requestedActions && !signals.urgentMessages) {
      return []
    }

    const dueDate = this.detectDueDate(email)
    const scheduledTime = this.detectScheduledTime(email, dueDate)
    const priority: TaskPriority = signals.urgentMessages ? 'urgent' : signals.deadlines ? 'high' : 'medium'
    const titleBase = email.subject?.replace(/^(re|fw|fwd):\s*/i, '').trim() || `Follow up with ${email.from}`

    return [{
      id: makeId('suggestion'),
      title: signals.meetings ? `Prepare for meeting: ${titleBase}` : `Follow up: ${titleBase}`,
      description: `Suggested from email by ${email.from}.\n\n${email.body.slice(0, 700)}`,
      priority,
      dueDate,
      scheduledTime,
      reminderSuggestions: dueDate
        ? ['Morning of the due date', 'One hour before scheduled time if time is set']
        : ['Tomorrow morning', 'Next work session'],
      source: 'email',
      linkedEmail: sourceMetadata(email),
    }]
  }

  private detectSignals(email: EmailMessage): EmailSignals {
    const text = `${email.subject} ${email.body}`.toLowerCase()
    return {
      assignments: /\b(assigned|assignment|owner|you are responsible|can you|could you|please)\b/.test(text),
      deadlines: /\b(due|deadline|by eod|by end of day|before|no later than|tomorrow|today)\b/.test(text),
      meetings: /\b(meeting|call|sync|zoom|teams|calendar|appointment)\b/.test(text),
      requestedActions: /\b(please|can you|could you|need you to|action required|follow up|review|send|prepare|confirm)\b/.test(text),
      urgentMessages: /\b(urgent|asap|immediately|critical|priority|time sensitive)\b/.test(text),
    }
  }

  private detectDueDate(email: EmailMessage): string | undefined {
    const text = `${email.subject} ${email.body}`.toLowerCase()
    const now = new Date()
    if (/\btoday\b/.test(text)) return now.toISOString().slice(0, 10)
    if (/\btomorrow\b/.test(text)) {
      const d = new Date(now)
      d.setDate(d.getDate() + 1)
      return d.toISOString().slice(0, 10)
    }

    const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/)
    if (iso) return iso[1]

    const slash = text.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/)
    if (slash) {
      const month = Number(slash[1])
      const day = Number(slash[2])
      const rawYear = slash[3] ? Number(slash[3]) : now.getFullYear()
      const year = rawYear < 100 ? 2000 + rawYear : rawYear
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      }
    }

    const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const weekdayIndex = weekdays.findIndex(day => new RegExp(`\\b${day}\\b`).test(text))
    if (weekdayIndex >= 0) {
      const d = new Date(now)
      const delta = (weekdayIndex - d.getDay() + 7) % 7 || 7
      d.setDate(d.getDate() + delta)
      return d.toISOString().slice(0, 10)
    }

    return undefined
  }

  private detectScheduledTime(email: EmailMessage, dueDate?: string): string | undefined {
    if (!dueDate) return undefined
    const text = `${email.subject} ${email.body}`.toLowerCase()
    const match = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/)
    if (!match) return undefined

    let hour = Number(match[1])
    const minute = Number(match[2] || '0')
    const meridiem = match[3]
    if (meridiem === 'pm' && hour < 12) hour += 12
    if (meridiem === 'am' && hour === 12) hour = 0
    if (hour > 23 || minute > 59) return undefined
    return `${dueDate}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`
  }
}
