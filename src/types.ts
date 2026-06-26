// Type declarations for the IPC bridge exposed via preload.ts

export type AIProvider = 'lmstudio' | 'claude'

export type AppPage = 'chat' | 'email' | 'tasks' | 'whatsapp' | 'whatsapp-requests' | 'obsidian' | 'activity-log' | 'settings' | 'developer'

export interface WhatsAppScheduleItem {
  id: string
  text: string
  active: boolean
}

export interface ZenoSettings {
  lmStudioBaseUrl: string
  lmStudioModel: string
  obsidianVaultPath: string
  systemPrompt: string
  maxContextTokens: number
  temperature: number
  theme: string
  // Provider
  activeProvider: AIProvider
  claudeEnabled: boolean
  claudeApiKey: string
  // WhatsApp
  whatsappEnabled: boolean
  whatsappAutoReply: boolean
  whatsappBusyScript: string
  whatsappZenoDescription: string
  whatsappScheduleItems: WhatsAppScheduleItem[]
  // PC Bridge
  pcBridgeEnabled: boolean
  pcBridgeUrl: string
  // Developer Mode
  devModeProjectPath: string
}

export interface LogEntry {
  id: string
  timestamp: string
  actionType: string
  category: string
  filePath?: string
  description: string
  success: boolean
  detail?: string
  sender?: string
}

export type EmailProviderId = 'outlook-desktop' | 'manual' | 'graph-future'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type TaskStatus = 'todo' | 'in-progress' | 'blocked' | 'done'

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

export interface TaskReminder {
  id: string
  remindAt: string
  label: string
  sentAt?: string
}

export interface ZenoTask {
  id: string
  title: string
  description: string
  priority: TaskPriority
  status: TaskStatus
  dueDate?: string
  scheduledTime?: string
  reminders: TaskReminder[]
  source: 'manual' | 'email' | 'schedule' | 'whatsapp'
  linkedEmail?: EmailSourceMetadata
  createdAt: string
  updatedAt: string
}

export interface CreateTaskInput {
  title: string
  description?: string
  priority?: TaskPriority
  status?: TaskStatus
  dueDate?: string
  scheduledTime?: string
  reminderAt?: string
  reminders?: TaskReminder[]
  source?: ZenoTask['source']
  linkedEmail?: EmailSourceMetadata
}

export interface ScheduleSnapshot {
  date: string
  overdue: ZenoTask[]
  today: ZenoTask[]
  upcoming: ZenoTask[]
  unscheduled: ZenoTask[]
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface OrchestratorResponse {
  success: boolean
  message?: string
  error?: string
  vaultContextUsed?: boolean
  memoryAction?: string
  tokensUsed?: number
  needsClaudeContextPermission?: boolean
  provider?: string
}

export interface WhatsAppRequest {
  id: string
  senderName: string
  senderNumber: string
  topic: string
  urgency: string
  message: string
  responsePref: string
  timestamp: string
  status: 'new' | 'completed' | 'ignored'
}

export interface ObsidianGraphNode {
  id: string
  label: string
  path: string
  tags: string[]
  links: string[]
}

export interface ObsidianGraphData {
  nodes: ObsidianGraphNode[]
  totalNotes: number
  totalLinks: number
  scanTime: string
}

export interface DevModeFileTree {
  name: string
  path: string
  type: 'file' | 'dir'
  children?: DevModeFileTree[]
  size?: number
}

declare global {
  interface Window {
    zeno: {
      window: {
        minimize: () => Promise<void>
        maximize: () => Promise<void>
        close: () => Promise<void>
      }
      settings: {
        get: () => Promise<ZenoSettings>
        save: (s: Partial<ZenoSettings>) => Promise<{ success: boolean }>
      }
      lmstudio: {
        test: () => Promise<{ connected: boolean; error?: string; models?: string[] }>
        models: () => Promise<{ success: boolean; models: string[]; error?: string }>
      }
      obsidian: {
        test: () => Promise<{ exists: boolean; path: string; error?: string }>
        browse: () => Promise<string | null>
        readNote: (path: string) => Promise<{ success: boolean; content?: string; error?: string }>
        createNote: (path: string, content: string) => Promise<{ success: boolean; error?: string }>
        search: (query: string) => Promise<Array<{
          filePath: string
          title: string
          snippet: string
          score: number
          tags: string[]
        }>>
        graph: () => Promise<ObsidianGraphData>
      }
      chat: {
        send: (payload: {
          messages: ChatMessage[]
          conversationId: string
          claudeContextApproved?: boolean
        }) => Promise<OrchestratorResponse>
      }
      provider: {
        status: () => Promise<{
          activeProvider: AIProvider
          claudeEnabled: boolean
          claudeConfigured: boolean
          lmStudioUrl: string
        }>
        testClaude: () => Promise<{ connected: boolean; error?: string }>
      }
      activityLog: {
        get: () => Promise<LogEntry[]>
        clear: () => Promise<boolean>
      }
      email: {
        providers: () => Promise<EmailProviderStatus[]>
        outlook: {
          recent: (limit: number) => Promise<EmailReadResult>
          unread: (limit: number) => Promise<EmailReadResult>
        }
        manual: {
          list: () => Promise<EmailMessage[]>
          import: (payload: {
            from: string
            subject: string
            body: string
            receivedAt?: string
          }) => Promise<EmailMessage>
        }
        analyze: (message: EmailMessage) => Promise<EmailAnalysis>
        draftReply: (message: EmailMessage) => Promise<EmailReplyDraft>
        sendApprovedReply: (message: EmailMessage, body: string) => Promise<{ success: boolean; error?: string }>
      }
      tasks: {
        list: () => Promise<ZenoTask[]>
        create: (payload: CreateTaskInput) => Promise<{ success: boolean; task: ZenoTask }>
        update: (id: string, updates: Partial<CreateTaskInput>) => Promise<{ success: boolean; task: ZenoTask }>
        delete: (id: string) => Promise<{ success: boolean }>
      }
      schedule: {
        snapshot: (date?: string) => Promise<ScheduleSnapshot>
        make: (payload: {
          date: string
          startTime?: string
          slotMinutes?: number
          taskIds?: string[]
        }) => Promise<{ success: boolean; tasks: ZenoTask[] }>
      }
      notifications: {
        status: () => Promise<{ supported: boolean; scheduledCount: number }>
      }
      confirm: {
        dialog: (title: string, message: string) => Promise<boolean>
      }
      whatsapp: {
        status: () => Promise<{ status: string; available: boolean }>
        init: () => Promise<{ success: boolean; error?: string }>
        logout: () => Promise<{ success: boolean }>
        destroy: () => Promise<{ success: boolean }>
        requests: {
          get: () => Promise<WhatsAppRequest[]>
          action: (id: string, action: 'complete' | 'ignore') => Promise<{ success: boolean }>
        }
        onStatus: (cb: (status: string) => void) => void
        onQR: (cb: (qr: string) => void) => void
        onReady: (cb: () => void) => void
        onDisconnected: (cb: (reason: string) => void) => void
        onNewRequest: (cb: (req: WhatsAppRequest) => void) => void
        removeAllListeners: () => void
      }
      bridge: {
        health: () => Promise<{ connected: boolean; error?: string }>
      }
      devMode: {
        scanProject: (projectPath: string) => Promise<{ success: boolean; tree?: DevModeFileTree; error?: string }>
        readFile: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>
      }
    }
  }
}
