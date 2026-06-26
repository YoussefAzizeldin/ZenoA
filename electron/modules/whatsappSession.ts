/**
 * WhatsApp Session Manager
 * Tracks per-sender conversation state for the WhatsApp chatbot flow.
 * No persistence to disk — state is in-memory only for now.
 */

export type SessionState =
  | 'idle'
  | 'menu_sent'
  | 'option_4_collecting_name'
  | 'option_4_collecting_topic'
  | 'option_4_collecting_urgency'
  | 'option_4_collecting_message'
  | 'option_4_collecting_response_pref'
  | 'zeno_chat_mode'

export interface Option4Data {
  name?: string
  topic?: string
  urgency?: string
  message?: string
  responsePref?: string
}

export interface SenderSession {
  senderId: string
  state: SessionState
  option4Data: Option4Data
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  lastInteraction: number
  cooldownUntil: number
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

const SESSION_TIMEOUT_MS = 30 * 60 * 1000  // 30 minutes idle reset
const COOLDOWN_MS = 3000                    // 3s between replies per sender

export class WhatsAppSessionManager {
  private sessions = new Map<string, SenderSession>()
  private requests: WhatsAppRequest[] = []

  getSession(senderId: string): SenderSession {
    let session = this.sessions.get(senderId)
    if (!session) {
      session = {
        senderId,
        state: 'idle',
        option4Data: {},
        chatHistory: [],
        lastInteraction: Date.now(),
        cooldownUntil: 0,
      }
      this.sessions.set(senderId, session)
    }
    // Auto-reset if idle too long
    if (Date.now() - session.lastInteraction > SESSION_TIMEOUT_MS) {
      session.state = 'idle'
      session.option4Data = {}
      session.chatHistory = []
    }
    return session
  }

  updateSession(senderId: string, updates: Partial<SenderSession>) {
    const session = this.getSession(senderId)
    Object.assign(session, updates, { lastInteraction: Date.now() })
  }

  resetSession(senderId: string) {
    this.updateSession(senderId, {
      state: 'idle',
      option4Data: {},
      chatHistory: [],
    })
  }

  isOnCooldown(senderId: string): boolean {
    const session = this.getSession(senderId)
    return Date.now() < session.cooldownUntil
  }

  setCooldown(senderId: string) {
    this.updateSession(senderId, { cooldownUntil: Date.now() + COOLDOWN_MS })
  }

  addChatMessage(senderId: string, role: 'user' | 'assistant', content: string) {
    const session = this.getSession(senderId)
    session.chatHistory.push({ role, content })
    // Cap history at 20 messages to avoid huge context
    if (session.chatHistory.length > 20) {
      session.chatHistory = session.chatHistory.slice(-20)
    }
  }

  // ─── WhatsApp Requests ──────────────────────────────────────────────

  createRequest(data: Omit<WhatsAppRequest, 'id' | 'timestamp' | 'status'>): WhatsAppRequest {
    const req: WhatsAppRequest = {
      ...data,
      id: `wa-req-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      timestamp: new Date().toISOString(),
      status: 'new',
    }
    this.requests.unshift(req)
    return req
  }

  getActiveRequests(): WhatsAppRequest[] {
    return this.requests.filter(r => r.status === 'new')
  }

  getAllRequests(): WhatsAppRequest[] {
    return this.requests
  }

  updateRequestStatus(id: string, status: 'completed' | 'ignored'): boolean {
    const req = this.requests.find(r => r.id === id)
    if (!req) return false
    req.status = status
    return true
  }
}

export const whatsappSessionManager = new WhatsAppSessionManager()
