import { create } from 'zustand'
import type { ZenoSettings, LogEntry, WhatsAppRequest, AIProvider, AppPage, ObsidianGraphData } from '../types'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  vaultContextUsed?: boolean
  error?: boolean
  provider?: string
}

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  createdAt: Date
}

export interface ConnectionStatus {
  lmStudio: 'unknown' | 'connected' | 'disconnected' | 'checking'
  obsidian: 'unknown' | 'found' | 'not_found' | 'checking'
  whatsapp: 'disabled' | 'initializing' | 'qr_pending' | 'connected' | 'disconnected' | 'error'
  claude: 'unknown' | 'configured' | 'not_configured'
  bridge: 'disabled' | 'connected' | 'disconnected'
  currentModel: string
  activeProvider: AIProvider
}

interface AppState {
  // Navigation
  currentPage: AppPage
  setCurrentPage: (page: AppPage) => void

  // Chat — multi-tab
  conversations: Conversation[]
  activeConvId: string
  isThinking: boolean
  pendingClaudeContextApproval: boolean

  // Settings
  settings: ZenoSettings | null
  settingsLoaded: boolean

  // Connection
  connection: ConnectionStatus

  // System status popup
  showSystemStatus: boolean

  // Activity log
  logEntries: LogEntry[]

  // WhatsApp
  whatsappQR: string | null
  whatsappRequests: WhatsAppRequest[]

  // Obsidian graph
  obsidianGraph: ObsidianGraphData | null
  obsidianGraphLoading: boolean

  // Actions — navigation
  setShowSystemStatus: (v: boolean) => void

  // Actions — chat
  activeConversation: () => Conversation
  addMessage: (msg: Omit<Message, 'id' | 'timestamp'>) => void
  setThinking: (v: boolean) => void
  newConversation: () => void
  switchConversation: (id: string) => void
  renameConversation: (id: string, title: string) => void
  closeConversation: (id: string) => void
  setPendingClaudeContextApproval: (v: boolean) => void

  // Actions — settings
  setSettings: (s: ZenoSettings) => void
  setSettingsLoaded: (v: boolean) => void

  // Actions — connection
  setConnection: (update: Partial<ConnectionStatus>) => void

  // Actions — log
  setLogEntries: (entries: LogEntry[]) => void

  // Actions — whatsapp
  setWhatsappQR: (qr: string | null) => void
  setWhatsappRequests: (reqs: WhatsAppRequest[]) => void
  addWhatsappRequest: (req: WhatsAppRequest) => void
  removeWhatsappRequest: (id: string) => void

  // Actions — obsidian graph
  setObsidianGraph: (data: ObsidianGraphData | null) => void
  setObsidianGraphLoading: (v: boolean) => void
}

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
const makeConvId = () => `conv-${Date.now()}`

function makeConversation(): Conversation {
  return {
    id: makeConvId(),
    title: 'New Chat',
    messages: [],
    createdAt: new Date(),
  }
}

const initialConv = makeConversation()

export const useAppStore = create<AppState>((set, get) => ({
  // Navigation
  currentPage: 'chat',
  setCurrentPage: (page) => set({ currentPage: page }),

  // Chat
  conversations: [initialConv],
  activeConvId: initialConv.id,
  isThinking: false,
  pendingClaudeContextApproval: false,

  settings: null,
  settingsLoaded: false,

  connection: {
    lmStudio: 'unknown',
    obsidian: 'unknown',
    whatsapp: 'disabled',
    claude: 'unknown',
    bridge: 'disabled',
    currentModel: '',
    activeProvider: 'lmstudio',
  },

  showSystemStatus: false,

  logEntries: [],

  whatsappQR: null,
  whatsappRequests: [],

  obsidianGraph: null,
  obsidianGraphLoading: false,

  setShowSystemStatus: (v) => set({ showSystemStatus: v }),

  activeConversation: () => {
    const { conversations, activeConvId } = get()
    return conversations.find(c => c.id === activeConvId) || conversations[0]
  },

  addMessage: (msg) =>
    set((state) => ({
      conversations: state.conversations.map(c =>
        c.id === state.activeConvId
          ? {
              ...c,
              messages: [...c.messages, { ...msg, id: makeId(), timestamp: new Date() }],
              title: c.messages.length === 0 && msg.role === 'user'
                ? msg.content.slice(0, 40) + (msg.content.length > 40 ? '…' : '')
                : c.title,
            }
          : c
      ),
    })),

  setThinking: (v) => set({ isThinking: v }),

  newConversation: () => {
    const conv = makeConversation()
    set((state) => ({
      conversations: [...state.conversations, conv],
      activeConvId: conv.id,
      isThinking: false,
      pendingClaudeContextApproval: false,
    }))
  },

  switchConversation: (id) => set({ activeConvId: id, isThinking: false }),

  renameConversation: (id, title) =>
    set((state) => ({
      conversations: state.conversations.map(c => c.id === id ? { ...c, title } : c),
    })),

  closeConversation: (id) =>
    set((state) => {
      const remaining = state.conversations.filter(c => c.id !== id)
      if (remaining.length === 0) {
        const newConv = makeConversation()
        return { conversations: [newConv], activeConvId: newConv.id }
      }
      const newActive = state.activeConvId === id
        ? remaining[remaining.length - 1].id
        : state.activeConvId
      return { conversations: remaining, activeConvId: newActive }
    }),

  setPendingClaudeContextApproval: (v) => set({ pendingClaudeContextApproval: v }),

  setSettings: (s) => set({ settings: s }),
  setSettingsLoaded: (v) => set({ settingsLoaded: v }),

  setConnection: (update) =>
    set((state) => ({ connection: { ...state.connection, ...update } })),

  setLogEntries: (entries) => set({ logEntries: entries }),

  setWhatsappQR: (qr) => set({ whatsappQR: qr }),
  setWhatsappRequests: (reqs) => set({ whatsappRequests: reqs }),
  addWhatsappRequest: (req) =>
    set((state) => ({ whatsappRequests: [req, ...state.whatsappRequests] })),
  removeWhatsappRequest: (id) =>
    set((state) => ({ whatsappRequests: state.whatsappRequests.filter(r => r.id !== id) })),

  setObsidianGraph: (data) => set({ obsidianGraph: data }),
  setObsidianGraphLoading: (v) => set({ obsidianGraphLoading: v }),
}))
