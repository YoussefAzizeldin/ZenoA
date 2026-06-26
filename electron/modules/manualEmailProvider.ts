import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { ActivityLog } from './activityLog'
import { EmailMessage } from './emailTypes'

export interface ManualEmailInput {
  from: string
  subject: string
  body: string
  receivedAt?: string
}

function getDataPath(fileName: string): string {
  if (process.env.NODE_ENV === 'development') {
    return path.join(process.cwd(), fileName)
  }
  return path.join(app.getPath('userData'), fileName)
}

function makeId(): string {
  return `manual-email-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export class ManualEmailProvider {
  readonly id = 'manual' as const
  private messages: EmailMessage[] = []
  private readonly filePath = getDataPath('zeno.manual-emails.json')

  constructor(private readonly log: ActivityLog) {
    this.load()
  }

  status() {
    return {
      provider: this.id,
      available: true,
      message: 'Manual import is available for local demo mode.',
    }
  }

  list(): EmailMessage[] {
    return [...this.messages]
  }

  importEmail(input: ManualEmailInput): EmailMessage {
    if (!input.subject?.trim() && !input.body?.trim()) {
      throw new Error('Enter a subject or body before importing.')
    }

    const message: EmailMessage = {
      id: makeId(),
      provider: this.id,
      from: input.from?.trim() || 'Manual import',
      subject: input.subject?.trim() || '(No subject)',
      body: input.body?.trim() || '',
      receivedAt: input.receivedAt || new Date().toISOString(),
      isUnread: false,
    }

    this.messages.unshift(message)
    this.save()
    this.log.log('EMAIL_IMPORT', `Manual email imported: ${message.subject}`, true, undefined, undefined, message.from)
    return message
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.filePath)) {
        this.messages = []
        return
      }
      const raw = fs.readFileSync(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw)
      this.messages = Array.isArray(parsed) ? parsed : []
    } catch (error) {
      this.messages = []
      this.log.log('EMAIL_PROVIDER_ERROR', `Failed to load manual emails: ${String(error)}`, false)
    }
  }

  private save(): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.messages, null, 2), 'utf-8')
    } catch (error) {
      this.log.log('EMAIL_PROVIDER_ERROR', `Failed to save manual email: ${String(error)}`, false)
    }
  }
}
