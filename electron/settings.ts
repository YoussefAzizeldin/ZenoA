import path from 'path'
import fs from 'fs'
import { app } from 'electron'

export type AIProvider = 'lmstudio' | 'claude'

export interface WhatsAppScheduleItem {
  id: string
  text: string
  active: boolean
}

export interface ZenoSettings {
  // LM Studio
  lmStudioBaseUrl: string
  lmStudioModel: string
  // Obsidian
  obsidianVaultPath: string
  // System prompt
  systemPrompt: string
  maxContextTokens: number
  temperature: number
  theme: string
  // AI Provider
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

const DEFAULT_BUSY_SCRIPT = `Hello, this is Zeno, Youssef's assistant. Youssef is currently busy, but I can take a message for him.

Please choose one of the options so I can help you:

1. Who/What is Zeno
2. What is currently on Youssef's schedule
3. I'd like to talk to you, Zeno
4. I need to talk to Youssef directly
5. Cancel`

const DEFAULT_ZENO_DESCRIPTION = `Zeno is Youssef's personal AI assistant. I help manage messages, reminders, notes, tasks, and requests while he is busy.`

const DEFAULT_SYSTEM_PROMPT = `You are Zeno, a highly intelligent personal AI assistant built for Youssef.
Speak like a serious, calm, professional assistant — think Jarvis from Iron Man.
Be direct, precise, and helpful. Do not be overly cheerful or use filler phrases.
You have access to Youssef's Obsidian vault as your second brain.
When relevant context from the vault is provided, use it to give more accurate and personalized answers.
Do not hallucinate or make up information about the user's notes.
Keep responses concise unless depth is needed.`

const DEFAULT_SETTINGS: ZenoSettings = {
  lmStudioBaseUrl: 'http://localhost:1234/v1',
  lmStudioModel: '',
  obsidianVaultPath: '',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  maxContextTokens: 4000,
  temperature: 0.7,
  theme: 'dark',
  activeProvider: 'lmstudio',
  claudeEnabled: false,
  claudeApiKey: '',
  whatsappEnabled: false,
  whatsappAutoReply: true,
  whatsappBusyScript: DEFAULT_BUSY_SCRIPT,
  whatsappZenoDescription: DEFAULT_ZENO_DESCRIPTION,
  whatsappScheduleItems: [],
  pcBridgeEnabled: false,
  pcBridgeUrl: 'http://localhost:7788',
  devModeProjectPath: '',
}

function getSettingsPath(): string {
  // In dev, store next to the project for portability.
  // In production, store in userData so it survives moves.
  if (process.env.NODE_ENV === 'development') {
    return path.join(process.cwd(), 'zeno.config.json')
  }
  return path.join(app.getPath('userData'), 'zeno.config.json')
}

export function loadSettings(): ZenoSettings {
  const settingsPath = getSettingsPath()
  try {
    if (fs.existsSync(settingsPath)) {
      const raw = fs.readFileSync(settingsPath, 'utf-8')
      const parsed = JSON.parse(raw)
      // Merge with defaults so new fields get their default values
      return { ...DEFAULT_SETTINGS, ...parsed }
    }
  } catch (e) {
    console.error('[Settings] Failed to load settings:', e)
  }
  return { ...DEFAULT_SETTINGS }
}

export function saveSettings(s: ZenoSettings): void {
  const settingsPath = getSettingsPath()
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2), 'utf-8')
  } catch (e) {
    console.error('[Settings] Failed to save settings:', e)
  }
}
