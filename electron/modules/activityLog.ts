export type ActionType =
  // Obsidian
  | 'NOTE_READ'
  | 'NOTE_CREATE'
  | 'NOTE_EDIT'
  | 'NOTE_DELETE'
  | 'NOTE_RENAME'
  | 'NOTE_MOVE'
  | 'VAULT_SEARCH'
  | 'MEMORY_SAVE'
  // LM Studio
  | 'LM_CALL'
  | 'LM_ERROR'
  | 'CONNECTION_TEST'
  // Permissions / system
  | 'PERMISSION_REQUEST'
  | 'PERMISSION_APPROVED'
  | 'PERMISSION_DENIED'
  | 'SYSTEM'
  // AI Provider
  | 'PROVIDER_SWITCH'
  | 'CLAUDE_CALL'
  | 'CLAUDE_ERROR'
  | 'CLAUDE_CONTEXT_REQUESTED'
  | 'CLAUDE_CONTEXT_APPROVED'
  | 'CLAUDE_CONTEXT_DENIED'
  // WhatsApp
  | 'WHATSAPP_CONNECTED'
  | 'WHATSAPP_DISCONNECTED'
  | 'WHATSAPP_QR'
  | 'WHATSAPP_MENU_SENT'
  | 'WHATSAPP_OPTION_1'
  | 'WHATSAPP_OPTION_2'
  | 'WHATSAPP_OPTION_3'
  | 'WHATSAPP_OPTION_4'
  | 'WHATSAPP_OPTION_5'
  | 'WHATSAPP_CHAT_START'
  | 'WHATSAPP_CHAT_END'
  | 'WHATSAPP_CLAUDE_CALL'
  | 'WHATSAPP_CLAUDE_ERROR'
  | 'WHATSAPP_LM_CALL'
  | 'WHATSAPP_LM_ERROR'
  | 'WHATSAPP_REQUEST_CREATED'
  | 'WHATSAPP_REQUEST_COMPLETED'
  | 'WHATSAPP_REQUEST_IGNORED'
  | 'WHATSAPP_GROUP_IGNORED'
  | 'WHATSAPP_BROADCAST_IGNORED'
  | 'WHATSAPP_BUSY_SENT'
  // PC Bridge
  | 'BRIDGE_STATUS'
  | 'BRIDGE_COMMAND'
  | 'BRIDGE_SUCCESS'
  | 'BRIDGE_FAILED'
  // Email intake
  | 'EMAIL_READ'
  | 'EMAIL_IMPORT'
  | 'EMAIL_ANALYZED'
  | 'EMAIL_TASK_SUGGESTED'
  | 'EMAIL_REPLY_DRAFTED'
  | 'EMAIL_REPLY_SENT'
  | 'EMAIL_PROVIDER_ERROR'
  // Tasks / schedule
  | 'TASK_CREATED'
  | 'TASK_UPDATED'
  | 'TASK_DELETED'
  | 'TASK_SCHEDULED'
  | 'TASK_REMINDER_SENT'
  | 'TASK_ERROR'

export interface LogEntry {
  id: string
  timestamp: string
  actionType: ActionType
  category: string
  filePath?: string
  description: string
  success: boolean
  detail?: string
  sender?: string
}

export class ActivityLog {
  private entries: LogEntry[] = []
  private maxEntries = 1000

  log(
    actionType: ActionType,
    description: string,
    success: boolean,
    filePath?: string,
    detail?: string,
    sender?: string
  ): LogEntry {
    const category = this.categoryFor(actionType)
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      actionType,
      category,
      filePath,
      description,
      success,
      detail,
      sender,
    }
    this.entries.unshift(entry)
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(0, this.maxEntries)
    }
    const status = success ? '✓' : '✗'
    console.log(`[${category}] ${status} ${actionType}: ${description}${sender ? ` (${sender})` : ''}`)
    return entry
  }

  private categoryFor(type: ActionType): string {
    if (type.startsWith('WHATSAPP')) return 'WhatsApp'
    if (type.startsWith('EMAIL')) return 'Email'
    if (type.startsWith('TASK')) return 'Tasks'
    if (type.startsWith('CLAUDE')) return 'Claude'
    if (type.startsWith('BRIDGE')) return 'PC Bridge'
    if (type.startsWith('PROVIDER')) return 'Provider'
    if (type.startsWith('NOTE') || type.startsWith('VAULT') || type.startsWith('MEMORY')) return 'Obsidian'
    if (type.startsWith('LM')) return 'LM Studio'
    return 'System'
  }

  getAll(): LogEntry[] { return this.entries }
  getByType(type: ActionType): LogEntry[] { return this.entries.filter(e => e.actionType === type) }
  getByCategory(cat: string): LogEntry[] { return this.entries.filter(e => e.category === cat) }
  clear(): void { this.entries = [] }
}
