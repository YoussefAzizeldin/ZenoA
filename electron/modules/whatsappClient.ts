/**
 * WhatsAppClient
 * Wraps whatsapp-web.js for Zeno.
 * Handles QR, session persistence, connection status, and message dispatching.
 *
 * whatsapp-web.js uses Puppeteer under the hood (Chromium).
 * Session is persisted to disk via LocalAuth so re-login is rare.
 *
 * IMPORTANT: This module is only imported in the main process.
 * Never import in renderer.
 *
 * NOTE: If whatsapp-web.js is not installed, this module will fail gracefully.
 * Run: npm install whatsapp-web.js qrcode-terminal --save
 */

import path from 'path'
import fs from 'fs'
import net from 'net'
import { app } from 'electron'
import { ActivityLog } from './activityLog'
import { WhatsAppHandler } from './whatsappHandler'
import { whatsappSessionManager } from './whatsappSession'
import { ZenoSettings } from '../settings'
import { BrowserWindow } from 'electron'

export type WAStatus =
  | 'disabled'
  | 'initializing'
  | 'qr_pending'
  | 'connected'
  | 'disconnected'
  | 'error'

let Client: any
let LocalAuth: any
let whatsappAvailable = false

try {
  const wwebjs = require('whatsapp-web.js')
  Client = wwebjs.Client
  LocalAuth = wwebjs.LocalAuth
  whatsappAvailable = true
} catch {
  console.warn('[WhatsApp] whatsapp-web.js not installed. WhatsApp features disabled.')
  console.warn('[WhatsApp] Install with: npm install whatsapp-web.js qrcode-terminal --save')
}

export class WhatsAppClient {
  private client: any = null
  private log: ActivityLog
  private handler: WhatsAppHandler
  private status: WAStatus = 'disabled'
  private mainWindow: BrowserWindow | null = null
  private getSettings: () => ZenoSettings

  constructor(log: ActivityLog, handler: WhatsAppHandler, getSettings: () => ZenoSettings) {
    this.log = log
    this.handler = handler
    this.getSettings = getSettings
  }

  setMainWindow(win: BrowserWindow) {
    this.mainWindow = win
  }

  getStatus(): WAStatus {
    return this.status
  }

  isAvailable(): boolean {
    return whatsappAvailable
  }

  private emit(event: string, data?: unknown) {
    try {
      this.mainWindow?.webContents?.send(event, data)
    } catch {/* window may be closed */}
  }

  private setStatus(s: WAStatus) {
    this.status = s
    this.emit('whatsapp:status', s)
  }

  private getAuthPath(): string {
    return app.isPackaged
      ? path.join(app.getPath('userData'), 'wa-auth')
      : path.join(process.cwd(), '.wa-auth')
  }

  private async isDevToolsPortAlive(profilePath: string): Promise<boolean> {
    const devToolsPath = path.join(profilePath, 'DevToolsActivePort')
    if (!fs.existsSync(devToolsPath)) return false

    try {
      const portText = fs.readFileSync(devToolsPath, 'utf-8').split(/\r?\n/)[0]?.trim()
      const port = Number(portText)
      if (!Number.isInteger(port) || port <= 0) return false

      return await new Promise<boolean>((resolve) => {
        const socket = net.connect({ host: '127.0.0.1', port })
        const done = (alive: boolean) => {
          socket.removeAllListeners()
          socket.destroy()
          resolve(alive)
        }
        socket.setTimeout(700)
        socket.once('connect', () => done(true))
        socket.once('timeout', () => done(false))
        socket.once('error', () => done(false))
      })
    } catch {
      return false
    }
  }

  private async cleanupStaleBrowserProfile(profilePath: string): Promise<void> {
    if (!fs.existsSync(profilePath)) return
    if (await this.isDevToolsPortAlive(profilePath)) return

    for (const name of ['DevToolsActivePort', 'SingletonCookie', 'SingletonLock', 'SingletonSocket']) {
      try {
        fs.rmSync(path.join(profilePath, name), { force: true, recursive: true })
      } catch { /* best effort only */ }
    }
  }

  async initialize(): Promise<{ success: boolean; error?: string }> {
    if (!whatsappAvailable) {
      return { success: false, error: 'whatsapp-web.js is not installed. Run: npm install whatsapp-web.js' }
    }
    if (this.client) {
      return { success: false, error: 'WhatsApp already initialized' }
    }

    const settings = this.getSettings()
    if (!settings.whatsappEnabled) {
      return { success: false, error: 'WhatsApp is disabled in settings' }
    }

    try {
      this.setStatus('initializing')
      this.log.log('WHATSAPP_CONNECTED', 'WhatsApp client initializing…', true)

      const authPath = this.getAuthPath()
      await this.cleanupStaleBrowserProfile(path.join(authPath, 'session'))

      this.client = new Client({
        authStrategy: new LocalAuth({ dataPath: authPath }),
        puppeteer: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
          ],
        },
      })

      this.client.on('qr', (qr: string) => {
        this.setStatus('qr_pending')
        this.log.log('WHATSAPP_QR', 'QR code generated — scan with WhatsApp', true)
        // Emit QR as a data URL for the renderer to display
        this.emit('whatsapp:qr', qr)
      })

      this.client.on('ready', () => {
        this.setStatus('connected')
        this.log.log('WHATSAPP_CONNECTED', 'WhatsApp connected successfully', true)
        this.emit('whatsapp:ready')
      })

      this.client.on('disconnected', (reason: string) => {
        this.setStatus('disconnected')
        this.log.log('WHATSAPP_DISCONNECTED', `WhatsApp disconnected: ${reason}`, false)
        this.client = null
        this.emit('whatsapp:disconnected', reason)
      })

      this.client.on('auth_failure', (msg: string) => {
        this.setStatus('error')
        this.log.log('WHATSAPP_DISCONNECTED', `WhatsApp auth failure: ${msg}`, false)
        this.client = null
      })

      this.client.on('message', async (message: any) => {
        try {
          // Skip group/broadcast
          const chat = await message.getChat()
          if (chat.isGroup) {
            this.log.log('WHATSAPP_GROUP_IGNORED', `Group message ignored from ${message.from}`, true, undefined, undefined, message.from)
            return
          }

          const contact = await message.getContact()
          const senderNumber = contact.number ? `+${contact.number}` : message.from
          const senderName = contact.pushname || contact.name || senderNumber

          const reply = await this.handler.handleMessage({
            senderId: message.from,
            senderNumber,
            senderName,
            body: message.body,
            isGroup: chat.isGroup,
            isBroadcast: message.isBroadcast,
          })

          if (reply) {
            await message.reply(reply)
          }
        } catch (err) {
          console.error('[WhatsApp] Error handling message:', err)
        }
      })

      await this.client.initialize()
      return { success: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (this.client) {
        try {
          await this.client.destroy()
        } catch { /* ignore cleanup failures */ }
      }
      this.setStatus('error')
      this.log.log('WHATSAPP_DISCONNECTED', `WhatsApp init failed: ${msg}`, false)
      this.client = null
      return { success: false, error: msg }
    }
  }

  async destroy(): Promise<void> {
    if (this.client) {
      try {
        await this.client.destroy()
      } catch { /* ignore */ }
      this.client = null
    }
    this.setStatus('disabled')
    this.log.log('WHATSAPP_DISCONNECTED', 'WhatsApp session destroyed', true)
  }

  async logout(): Promise<void> {
    if (this.client) {
      try {
        await this.client.logout()
      } catch { /* ignore */ }
      this.client = null
    }
    this.setStatus('disabled')
    this.log.log('WHATSAPP_DISCONNECTED', 'WhatsApp logged out (session cleared)', true)
  }
}
