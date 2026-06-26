import { contextBridge, ipcRenderer } from 'electron'

// Expose a typed API to the renderer via window.zeno
// This is the ONLY way the renderer communicates with the main process.
// API keys never touch this file — all sensitive calls go main-process only.

contextBridge.exposeInMainWorld('zeno', {

  // ── Window controls ───────────────────────────────────────────
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close:    () => ipcRenderer.invoke('window:close'),
  },

  // ── Settings ──────────────────────────────────────────────────
  settings: {
    get:  ()           => ipcRenderer.invoke('settings:get'),
    save: (s: unknown) => ipcRenderer.invoke('settings:save', s),
  },

  // ── LM Studio ─────────────────────────────────────────────────
  lmstudio: {
    test:   () => ipcRenderer.invoke('lmstudio:test'),
    models: () => ipcRenderer.invoke('lmstudio:models'),
  },

  // ── Obsidian ──────────────────────────────────────────────────
  obsidian: {
    test:       ()                    => ipcRenderer.invoke('obsidian:test'),
    browse:     ()                    => ipcRenderer.invoke('obsidian:browse'),
    readNote:   (p: string)           => ipcRenderer.invoke('obsidian:readNote', p),
    createNote: (p: string, c: string) => ipcRenderer.invoke('obsidian:createNote', { path: p, content: c }),
    search:     (q: string)           => ipcRenderer.invoke('obsidian:search', q),
    graph:      ()                    => ipcRenderer.invoke('obsidian:graph'),
  },

  // ── Chat ──────────────────────────────────────────────────────
  chat: {
    send: (payload: unknown) => ipcRenderer.invoke('chat:send', payload),
  },

  // ── AI Provider ───────────────────────────────────────────────
  provider: {
    status:    () => ipcRenderer.invoke('provider:status'),
    testClaude: () => ipcRenderer.invoke('claude:test'),
  },

  // ── Activity Log ──────────────────────────────────────────────
  activityLog: {
    get:   () => ipcRenderer.invoke('activitylog:get'),
    clear: () => ipcRenderer.invoke('activitylog:clear'),
  },

  // Email intake - local-first only
  email: {
    providers: () => ipcRenderer.invoke('email:providers'),
    outlook: {
      recent: (limit: number) => ipcRenderer.invoke('email:outlook:recent', limit),
      unread: (limit: number) => ipcRenderer.invoke('email:outlook:unread', limit),
    },
    manual: {
      list: () => ipcRenderer.invoke('email:manual:list'),
      import: (payload: unknown) => ipcRenderer.invoke('email:manual:import', payload),
    },
    analyze: (message: unknown) => ipcRenderer.invoke('email:analyze', message),
    draftReply: (message: unknown) => ipcRenderer.invoke('email:draft-reply', message),
    sendApprovedReply: (message: unknown, body: string) =>
      ipcRenderer.invoke('email:send-approved-reply', { message, body }),
  },

  tasks: {
    list: () => ipcRenderer.invoke('tasks:list'),
    create: (payload: unknown) => ipcRenderer.invoke('tasks:create', payload),
    update: (id: string, updates: unknown) => ipcRenderer.invoke('tasks:update', { id, updates }),
    delete: (id: string) => ipcRenderer.invoke('tasks:delete', id),
  },

  schedule: {
    snapshot: (date?: string) => ipcRenderer.invoke('schedule:snapshot', date),
    make: (payload: unknown) => ipcRenderer.invoke('schedule:make', payload),
  },

  notifications: {
    status: () => ipcRenderer.invoke('notifications:status'),
  },

  // ── Confirm dialog ────────────────────────────────────────────
  confirm: {
    dialog: (title: string, message: string) =>
      ipcRenderer.invoke('confirm:dialog', { title, message }),
  },

  // ── WhatsApp ──────────────────────────────────────────────────
  whatsapp: {
    status:  () => ipcRenderer.invoke('whatsapp:status'),
    init:    () => ipcRenderer.invoke('whatsapp:init'),
    logout:  () => ipcRenderer.invoke('whatsapp:logout'),
    destroy: () => ipcRenderer.invoke('whatsapp:destroy'),
    requests: {
      get:    ()                                    => ipcRenderer.invoke('whatsapp:requests:get'),
      action: (id: string, action: 'complete' | 'ignore') =>
        ipcRenderer.invoke('whatsapp:requests:action', { id, action }),
    },
    // Push events from main process → renderer
    onStatus:       (cb: (status: string) => void)    => ipcRenderer.on('whatsapp:status',       (_e, s)   => cb(s)),
    onQR:           (cb: (qr: string) => void)         => ipcRenderer.on('whatsapp:qr',           (_e, qr)  => cb(qr)),
    onReady:        (cb: () => void)                   => ipcRenderer.on('whatsapp:ready',        ()        => cb()),
    onDisconnected: (cb: (reason: string) => void)     => ipcRenderer.on('whatsapp:disconnected', (_e, r)   => cb(r)),
    onNewRequest:   (cb: (req: unknown) => void)       => ipcRenderer.on('whatsapp:new_request',  (_e, req) => cb(req)),
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('whatsapp:status')
      ipcRenderer.removeAllListeners('whatsapp:qr')
      ipcRenderer.removeAllListeners('whatsapp:ready')
      ipcRenderer.removeAllListeners('whatsapp:disconnected')
      ipcRenderer.removeAllListeners('whatsapp:new_request')
    },
  },

  // ── PC Bridge ─────────────────────────────────────────────────
  bridge: {
    health: () => ipcRenderer.invoke('bridge:health'),
  },

  // ── Developer Mode ────────────────────────────────────────────
  devMode: {
    scanProject: (projectPath: string) =>
      ipcRenderer.invoke('devmode:scan', projectPath),
    readFile: (filePath: string) =>
      ipcRenderer.invoke('devmode:readfile', filePath),
  },
})
