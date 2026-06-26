export type EmailProviderId = 'outlook-desktop' | 'manual' | 'graph-future'

export interface EmailMessage {
  id: string
  provider: EmailProviderId
  from: string
  subject: string
  body: string
  receivedAt?: string
  isUnread?: boolean
  externalId?: string
}

export interface EmailSourceMetadata {
  provider: EmailProviderId
  emailId: string
  externalId?: string
  from: string
  subject: string
  receivedAt?: string
}

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type TaskStatus = 'todo' | 'in-progress' | 'blocked' | 'done'

export interface TaskSuggestion {
  id: string
  title: string
  description: string
  priority: TaskPriority
  dueDate?: string
  scheduledTime?: string
  reminderSuggestions: string[]
  source: 'email'
  linkedEmail: EmailSourceMetadata
}

export interface EmailSignals {
  assignments: boolean
  deadlines: boolean
  meetings: boolean
  requestedActions: boolean
  urgentMessages: boolean
}

export interface EmailAnalysis {
  emailId: string
  summary: string
  signals: EmailSignals
  suggestions: TaskSuggestion[]
}

export interface EmailReplyDraft {
  id: string
  provider: EmailProviderId
  emailId: string
  to: string
  subject: string
  body: string
  createdAt: string
}

export interface EmailProviderStatus {
  provider: EmailProviderId
  available: boolean
  message: string
}

export interface EmailReadResult {
  success: boolean
  provider: EmailProviderId
  messages: EmailMessage[]
  error?: string
}
