import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import dotenv from 'dotenv'

// Load .env FIRST before any other imports that read process.env
dotenv.config({ path: path.join(process.cwd(), '.env') })

import { LMStudioClient }       from './modules/lmStudioClient'
import { ClaudeClient }          from './modules/claudeClient'
import { ObsidianManager }       from './modules/obsidianManager'
import { MemoryManager }         from './modules/memoryManager'
import { Orchestrator }          from './modules/orchestrator'
import { ActivityLog }           from './modules/activityLog'
import { WhatsAppHandler }       from './modules/whatsappHandler'
import { WhatsAppClient }        from './modules/whatsappClient'
import { whatsappSessionManager } from './modules/whatsappSession'
import { PCBridgeClient }        from './modules/pcBridge'
import { buildGraph }            from './modules/obsidianGraph'
import { scanProject, readProjectFile } from './modules/developerMode'
import { TaskService, CreateTaskInput, UpdateTaskInput } from './modules/taskService'
import { ScheduleService, ScheduleMakerInput } from './modules/scheduleService'
import { NotificationService } from './modules/notificationService'
import { EmailIntakeService } from './modules/emailIntakeService'
import { OutlookDesktopProvider } from './modules/outlookDesktopProvider'
import { ManualEmailInput, ManualEmailProvider } from './modules/manualEmailProvider'
import { EmailSummaryService } from './modules/emailSummaryService'
import { EmailTaskExtractor } from './modules/emailTaskExtractor'
import { EmailReplyService } from './modules/emailReplyService'
import { EmailMessage } from './modules/emailTypes'
import { loadSettings, saveSettings, ZenoSettings } from './settings'

let mainWindow: BrowserWindow | null = null

// ── App-level singletons ─────────────────────────────────────────────────────
let settings = loadSettings()
const activityLog = new ActivityLog()

let lmClient     = new LMStudioClient(settings.lmStudioBaseUrl, settings.lmStudioModel)
const claudeClient = new ClaudeClient(settings.claudeApiKey)

let obsidianManager = new ObsidianManager(settings.obsidianVaultPath, activityLog)
let memoryManager   = new MemoryManager(obsidianManager, activityLog)
let orchestrator    = new Orchestrator(lmClient, claudeClient, obsidianManager, memoryManager, activityLog, settings)

const waHandler = new WhatsAppHandler(activityLog, () => lmClient, whatsappSessionManager, () => settings)
const waClient  = new WhatsAppClient(activityLog, waHandler, () => settings)

let pcBridge = new PCBridgeClient(settings.pcBridgeUrl, settings.pcBridgeEnabled, activityLog)
const taskService = new TaskService(activityLog)
const scheduleService = new ScheduleService(taskService, activityLog)
const notificationService = new NotificationService(taskService, activityLog)
const outlookDesktopProvider = new OutlookDesktopProvider(activityLog)
const manualEmailProvider = new ManualEmailProvider(activityLog)
const emailSummaryService = new EmailSummaryService(() => lmClient, claudeClient, () => settings, activityLog)
const emailTaskExtractor = new EmailTaskExtractor(() => lmClient, claudeClient, () => settings, activityLog)
const emailReplyService = new EmailReplyService(() => lmClient, claudeClient, () => settings, activityLog)
const emailIntakeService = new EmailIntakeService(
  outlookDesktopProvider,
  manualEmailProvider,
  emailSummaryService,
  emailTaskExtractor,
  emailReplyService
)

// ── WhatsApp new-request callback → push to renderer ─────────────────────────
waHandler.onNewRequest = (data) => {
  const req = whatsappSessionManager.createRequest(data)
  mainWindow?.webContents?.send('whatsapp:new_request', req)
  activityLog.log(
    'WHATSAPP_REQUEST_CREATED',
    `New WhatsApp request from ${data.senderNumber}: ${data.topic}`,
    true, undefined, undefined, data.senderNumber
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development' || !app.isPackaged
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 980,
    minHeight: 640,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#07070d',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    icon: path.join(__dirname, '../assets/icon.png'),
  })

  if (isDevelopment()) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })

  // Give WhatsApp client a reference to push events to the renderer
  waClient.setMainWindow(mainWindow)

  // Auto-init WhatsApp if enabled
  if (settings.whatsappEnabled) {
    setTimeout(() => {
      waClient.initialize().catch(console.error)
    }, 3000)
  }
}

app.whenReady().then(() => {
  notificationService.refresh()
  createWindow()
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (mainWindow === null) createWindow() })

// ─────────────────────────────────────────────────────────────────────────────
// IPC HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

// ── Window controls ───────────────────────────────────────────────────────────
ipcMain.handle('window:minimize', () => mainWindow?.minimize())
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.handle('window:close', () => mainWindow?.close())

// ── Settings ──────────────────────────────────────────────────────────────────
ipcMain.handle('settings:get', () => settings)

ipcMain.handle('settings:save', async (_e, newSettings: Partial<ZenoSettings>) => {
  const prevProvider = settings.activeProvider
  settings = { ...settings, ...newSettings }
  saveSettings(settings)

  // Reinitialise modules with new settings
  lmClient        = new LMStudioClient(settings.lmStudioBaseUrl, settings.lmStudioModel)
  claudeClient.setApiKey(settings.claudeApiKey)
  obsidianManager = new ObsidianManager(settings.obsidianVaultPath, activityLog)
  memoryManager   = new MemoryManager(obsidianManager, activityLog)
  orchestrator    = new Orchestrator(lmClient, claudeClient, obsidianManager, memoryManager, activityLog, settings)
  pcBridge.updateConfig(settings.pcBridgeUrl, settings.pcBridgeEnabled)

  if (newSettings.activeProvider && newSettings.activeProvider !== prevProvider) {
    activityLog.log('PROVIDER_SWITCH', `AI provider switched to ${settings.activeProvider}`, true)
  }

  return { success: true }
})

// ── LM Studio ─────────────────────────────────────────────────────────────────
ipcMain.handle('lmstudio:test',   async () => lmClient.healthCheck())
ipcMain.handle('lmstudio:models', async () => lmClient.listModels())

// ── Obsidian ──────────────────────────────────────────────────────────────────
ipcMain.handle('obsidian:test',   async () => obsidianManager.testVault())

ipcMain.handle('obsidian:browse', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
    title: 'Select Obsidian Vault Folder',
  })
  if (!result.canceled && result.filePaths.length > 0) return result.filePaths[0]
  return null
})

ipcMain.handle('obsidian:readNote',
  async (_e, filePath: string) => obsidianManager.readNote(filePath))

ipcMain.handle('obsidian:createNote',
  async (_e, payload: { path: string; content: string }) =>
    obsidianManager.createNote(payload.path, payload.content))

ipcMain.handle('obsidian:search',
  async (_e, query: string) => obsidianManager.searchNotes(query))

// NEW — Obsidian graph for the Memory page
ipcMain.handle('obsidian:graph', async () => {
  const vaultTest = obsidianManager.testVault()
  if (!vaultTest.exists) {
    return { nodes: [], totalNotes: 0, totalLinks: 0, scanTime: new Date().toISOString() }
  }
  activityLog.log('VAULT_SEARCH', `Vault graph scan started for: ${vaultTest.path}`, true, vaultTest.path)
  try {
    const data = buildGraph(vaultTest.path)
    activityLog.log('VAULT_SEARCH', `Graph scan complete: ${data.totalNotes} notes, ${data.totalLinks} links`, true)
    return data
  } catch (e) {
    activityLog.log('VAULT_SEARCH', `Graph scan failed: ${String(e)}`, false)
    return { nodes: [], totalNotes: 0, totalLinks: 0, scanTime: new Date().toISOString() }
  }
})

// ── Chat ──────────────────────────────────────────────────────────────────────
ipcMain.handle('chat:send', async (_e, payload: {
  messages: Array<{ role: string; content: string }>
  conversationId: string
  claudeContextApproved?: boolean
}) => {
  return orchestrator.handleUserMessage(
    payload.messages,
    payload.conversationId,
    payload.claudeContextApproved || false
  )
})

// ── AI Provider ───────────────────────────────────────────────────────────────
ipcMain.handle('provider:status', () => ({
  activeProvider:  settings.activeProvider,
  claudeEnabled:   settings.claudeEnabled,
  claudeConfigured: claudeClient.isConfigured(),
  lmStudioUrl:     settings.lmStudioBaseUrl,
}))

ipcMain.handle('claude:test', async () => {
  if (!claudeClient.isConfigured()) {
    return { connected: false, error: 'Claude API key not set in Settings.' }
  }
  const result = await claudeClient.chat(
    'You are a test ping.',
    [{ role: 'user', content: 'Reply with only the word: ok' }],
    5
  )
  return { connected: result.success, error: result.error }
})

// ── Activity Log ──────────────────────────────────────────────────────────────
ipcMain.handle('activitylog:get',   () => activityLog.getAll())
ipcMain.handle('activitylog:clear', () => { activityLog.clear(); return true })

// Email intake - local-first providers only. No send/delete/modify operations.
ipcMain.handle('email:providers', async () => emailIntakeService.providerStatuses())
ipcMain.handle('email:outlook:recent', async (_e, limit: number) =>
  emailIntakeService.readOutlookRecent(limit))
ipcMain.handle('email:outlook:unread', async (_e, limit: number) =>
  emailIntakeService.readOutlookUnread(limit))
ipcMain.handle('email:manual:list', () => emailIntakeService.listManual())
ipcMain.handle('email:manual:import', (_e, payload: ManualEmailInput) =>
  emailIntakeService.importManual(payload))
ipcMain.handle('email:analyze', async (_e, payload: EmailMessage) =>
  emailIntakeService.analyze(payload))
ipcMain.handle('email:draft-reply', async (_e, payload: EmailMessage) =>
  emailIntakeService.draftReply(payload))
ipcMain.handle('email:send-approved-reply', async (_e, payload: { message: EmailMessage; body: string }) =>
  emailIntakeService.sendApprovedReply(payload.message, payload.body))

// Tasks, scheduling, and reminders.
ipcMain.handle('tasks:list', () => taskService.list())
ipcMain.handle('tasks:create', (_e, payload: CreateTaskInput) => {
  const task = taskService.create(payload)
  notificationService.refresh()
  return { success: true, task }
})
ipcMain.handle('tasks:update', (_e, payload: { id: string; updates: UpdateTaskInput }) => {
  const task = taskService.update(payload.id, payload.updates)
  notificationService.refresh()
  return { success: true, task }
})
ipcMain.handle('tasks:delete', (_e, id: string) => {
  const success = taskService.remove(id)
  notificationService.refresh()
  return { success }
})
ipcMain.handle('schedule:snapshot', (_e, date?: string) => scheduleService.snapshot(date))
ipcMain.handle('schedule:make', (_e, payload: ScheduleMakerInput) => {
  const tasks = scheduleService.makeSchedule(payload)
  notificationService.refresh()
  return { success: true, tasks }
})
ipcMain.handle('notifications:status', () => notificationService.status())

// ── Confirm dialog ────────────────────────────────────────────────────────────
ipcMain.handle('confirm:dialog', async (_e, payload: { title: string; message: string }) => {
  const result = await dialog.showMessageBox(mainWindow!, {
    type: 'warning',
    buttons: ['Cancel', 'Confirm'],
    defaultId: 0,
    cancelId: 0,
    title: payload.title,
    message: payload.message,
  })
  return result.response === 1
})

// ── WhatsApp ──────────────────────────────────────────────────────────────────
ipcMain.handle('whatsapp:status', () => ({
  status:    waClient.getStatus(),
  available: waClient.isAvailable(),
}))

ipcMain.handle('whatsapp:init',    async () => waClient.initialize())
ipcMain.handle('whatsapp:logout',  async () => { await waClient.logout();  return { success: true } })
ipcMain.handle('whatsapp:destroy', async () => { await waClient.destroy(); return { success: true } })

ipcMain.handle('whatsapp:requests:get', () => whatsappSessionManager.getActiveRequests())

ipcMain.handle('whatsapp:requests:action',
  async (_e, payload: { id: string; action: 'complete' | 'ignore' }) => {
    const ok = whatsappSessionManager.updateRequestStatus(
      payload.id,
      payload.action === 'complete' ? 'completed' : 'ignored'
    )
    if (ok) {
      const actionType = payload.action === 'complete'
        ? 'WHATSAPP_REQUEST_COMPLETED'
        : 'WHATSAPP_REQUEST_IGNORED'
      activityLog.log(actionType, `Request ${payload.id} marked as ${payload.action}`, true)
    }
    return { success: ok }
  }
)

// ── PC Bridge ─────────────────────────────────────────────────────────────────
ipcMain.handle('bridge:health', async () => pcBridge.checkHealth())

// ── Developer Mode ────────────────────────────────────────────────────────────
ipcMain.handle('devmode:scan', async (_e, projectPath: string) => {
  // Log the action
  activityLog.log('SYSTEM', `Developer Mode scan started: ${projectPath}`, true, projectPath)
  const result = scanProject(projectPath)
  activityLog.log(
    'SYSTEM',
    result.success ? `Developer Mode scan complete` : `Developer Mode scan failed: ${result.error}`,
    result.success,
    projectPath
  )
  return result
})

ipcMain.handle('devmode:readfile', async (_e, filePath: string) => {
  // Safety: only allow reads inside the configured project path
  const projectRoot = settings.devModeProjectPath
  if (!projectRoot) {
    return { success: false, error: 'Project path not configured in Settings.' }
  }
  return readProjectFile(filePath, projectRoot)
})
