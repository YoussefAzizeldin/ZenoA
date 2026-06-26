/**
 * WhatsAppHandler
 * Handles incoming WhatsApp messages.
 *
 * Safety:
 * - Groups are ignored.
 * - Broadcasts are ignored.
 * - Option 3 uses LM Studio only.
 * - Option 3 never gets Obsidian context, private schedule data, or tool access.
 */

import { ActivityLog } from './activityLog'
import { ChatMessage, LMStudioClient } from './lmStudioClient'
import { SenderSession, WhatsAppSessionManager } from './whatsappSession'
import { ZenoSettings } from '../settings'

export interface IncomingMessage {
  senderId: string
  senderNumber: string
  senderName?: string
  body: string
  isGroup: boolean
  isBroadcast: boolean
}

export class WhatsAppHandler {
  private log: ActivityLog
  private getLmClient: () => LMStudioClient
  private sessions: WhatsAppSessionManager
  private getSettings: () => ZenoSettings

  constructor(
    log: ActivityLog,
    getLmClient: () => LMStudioClient,
    sessions: WhatsAppSessionManager,
    getSettings: () => ZenoSettings
  ) {
    this.log = log
    this.getLmClient = getLmClient
    this.sessions = sessions
    this.getSettings = getSettings
  }

  async handleMessage(msg: IncomingMessage): Promise<string | null> {
    if (msg.isGroup) {
      this.log.log('WHATSAPP_GROUP_IGNORED', 'Group message ignored', true, undefined, undefined, msg.senderId)
      return null
    }

    if (msg.isBroadcast) {
      this.log.log('WHATSAPP_BROADCAST_IGNORED', 'Broadcast ignored', true, undefined, undefined, msg.senderId)
      return null
    }

    const settings = this.getSettings()
    if (!settings.whatsappEnabled) return null

    if (this.sessions.isOnCooldown(msg.senderId)) return null
    this.sessions.setCooldown(msg.senderId)

    const session = this.sessions.getSession(msg.senderId)
    const body = msg.body.trim()
    const lowerBody = body.toLowerCase()

    if (['menu', 'cancel', 'stop', 'exit'].includes(lowerBody)) {
      this.sessions.resetSession(msg.senderId)
      if (lowerBody === 'menu') {
        return this.sendMenuAndLog(msg, settings)
      }
      return 'Understood. Feel free to message again anytime.'
    }

    switch (session.state) {
      case 'idle':
        if (settings.whatsappAutoReply) {
          this.sessions.updateSession(msg.senderId, { state: 'menu_sent' })
          this.log.log('WHATSAPP_BUSY_SENT', `Busy script sent to ${msg.senderNumber}`, true, undefined, undefined, msg.senderId)
          return settings.whatsappBusyScript
        }
        return null

      case 'menu_sent':
        return this.handleMenuSelection(msg, body, settings)

      case 'zeno_chat_mode':
        return this.handleZenoChat(msg, body, settings)

      case 'option_4_collecting_name':
        return this.handleOption4Step(msg, session, 'name', body)
      case 'option_4_collecting_topic':
        return this.handleOption4Step(msg, session, 'topic', body)
      case 'option_4_collecting_urgency':
        return this.handleOption4Step(msg, session, 'urgency', body)
      case 'option_4_collecting_message':
        return this.handleOption4Step(msg, session, 'message', body)
      case 'option_4_collecting_response_pref':
        return this.handleOption4Step(msg, session, 'responsePref', body)

      default:
        this.sessions.updateSession(msg.senderId, { state: 'menu_sent' })
        return settings.whatsappBusyScript
    }
  }

  private async handleMenuSelection(
    msg: IncomingMessage,
    body: string,
    settings: ZenoSettings
  ): Promise<string | null> {
    const choice = body.trim()

    switch (choice) {
      case '1':
        this.log.log('WHATSAPP_OPTION_1', `Option 1 selected by ${msg.senderNumber}`, true, undefined, undefined, msg.senderId)
        this.sessions.updateSession(msg.senderId, { state: 'menu_sent' })
        return `${settings.whatsappZenoDescription}\n\nWould you like to choose another option?\n\n${settings.whatsappBusyScript}`

      case '2':
        this.log.log('WHATSAPP_OPTION_2', `Option 2 selected by ${msg.senderNumber}`, true, undefined, undefined, msg.senderId)
        this.sessions.updateSession(msg.senderId, { state: 'menu_sent' })
        return this.buildScheduleReply(settings)

      case '3': {
        this.log.log('WHATSAPP_OPTION_3', `Option 3 selected by ${msg.senderNumber}`, true, undefined, undefined, msg.senderId)
        const lmStatus = await this.getLmClient().healthCheck()
        if (!lmStatus.connected) {
          this.sessions.updateSession(msg.senderId, { state: 'menu_sent' })
          return `Zeno chat mode is currently unavailable because LM Studio is not reachable. Please choose another option.\n\n${settings.whatsappBusyScript}`
        }
        this.sessions.updateSession(msg.senderId, { state: 'zeno_chat_mode', chatHistory: [] })
        this.log.log('WHATSAPP_CHAT_START', `LM Studio chat mode started for ${msg.senderNumber}`, true, undefined, undefined, msg.senderId)
        return "You are now talking to Zeno. Type 'menu' anytime to return to the main options."
      }

      case '4':
        this.log.log('WHATSAPP_OPTION_4', `Option 4 selected by ${msg.senderNumber}`, true, undefined, undefined, msg.senderId)
        this.sessions.updateSession(msg.senderId, { state: 'option_4_collecting_name', option4Data: {} })
        return 'What is your name?'

      case '5':
        this.log.log('WHATSAPP_OPTION_5', `Option 5 selected by ${msg.senderNumber}`, true, undefined, undefined, msg.senderId)
        this.sessions.resetSession(msg.senderId)
        return "Understood. I won't take a message."

      default:
        return `Please reply with a number (1-5).\n\n${settings.whatsappBusyScript}`
    }
  }

  private handleOption4Step(
    msg: IncomingMessage,
    session: SenderSession,
    field: keyof SenderSession['option4Data'],
    value: string
  ): string {
    const data = { ...session.option4Data, [field]: value }

    switch (field) {
      case 'name':
        this.sessions.updateSession(msg.senderId, {
          state: 'option_4_collecting_topic',
          option4Data: data,
        })
        return 'What is this about?'

      case 'topic':
        this.sessions.updateSession(msg.senderId, {
          state: 'option_4_collecting_urgency',
          option4Data: data,
        })
        return `How urgent is this?\n\n1. Not urgent\n2. Today\n3. As soon as possible\n4. Emergency`

      case 'urgency': {
        const urgencyMap: Record<string, string> = {
          '1': 'Not urgent',
          '2': 'Today',
          '3': 'As soon as possible',
          '4': 'Emergency',
        }
        const resolvedUrgency = urgencyMap[value] || value
        this.sessions.updateSession(msg.senderId, {
          state: 'option_4_collecting_message',
          option4Data: { ...data, urgency: resolvedUrgency },
        })
        return 'What message would you like me to send to Youssef?'
      }

      case 'message':
        this.sessions.updateSession(msg.senderId, {
          state: 'option_4_collecting_response_pref',
          option4Data: data,
        })
        return `How should Youssef respond?\n\n1. Reply on WhatsApp\n2. Call me\n3. Just read it\n4. I'll follow up later`

      case 'responsePref': {
        const prefMap: Record<string, string> = {
          '1': 'Reply on WhatsApp',
          '2': 'Call me',
          '3': 'Just read it',
          '4': "I'll follow up later",
        }
        const resolvedPref = prefMap[value] || value
        const finalData = { ...data, responsePref: resolvedPref }
        this.sessions.updateSession(msg.senderId, { option4Data: finalData })
        return this.finalizeOption4(msg, finalData)
      }

      default:
        return 'Something went wrong. Type "menu" to start over.'
    }
  }

  private finalizeOption4(
    msg: IncomingMessage,
    data: SenderSession['option4Data']
  ): string {
    if (this.onNewRequest) {
      this.onNewRequest({
        senderName: data.name || 'Unknown',
        senderNumber: msg.senderNumber,
        topic: data.topic || '',
        urgency: data.urgency || '',
        message: data.message || '',
        responsePref: data.responsePref || '',
      })
    }

    this.log.log(
      'WHATSAPP_REQUEST_CREATED',
      `New WhatsApp request from ${msg.senderNumber}: ${data.topic}`,
      true,
      undefined,
      JSON.stringify(data),
      msg.senderId
    )

    this.sessions.resetSession(msg.senderId)
    return 'Got it. I sent this request to Youssef.'
  }

  private async handleZenoChat(
    msg: IncomingMessage,
    body: string,
    settings: ZenoSettings
  ): Promise<string | null> {
    this.sessions.addChatMessage(msg.senderId, 'user', body)
    const session = this.sessions.getSession(msg.senderId)
    const messages: ChatMessage[] = [
      { role: 'system', content: this.buildWhatsAppSystemPrompt(msg.senderName) },
      ...session.chatHistory.map(h => ({ role: h.role, content: h.content } as ChatMessage)),
    ]

    this.log.log('WHATSAPP_LM_CALL', `LM Studio call for WhatsApp chat: ${msg.senderNumber}`, true, undefined, undefined, msg.senderId)
    const result = await this.getLmClient().chatCompletion(messages, settings.temperature, 350)

    if (!result.success) {
      this.log.log('WHATSAPP_LM_ERROR', `LM Studio error for ${msg.senderNumber}: ${result.error}`, false, undefined, result.error, msg.senderId)
      return "Zeno is temporarily unavailable. Please try again later or type 'menu' to go back."
    }

    const reply = result.content?.trim() || "Sorry, I didn't understand that."
    this.sessions.addChatMessage(msg.senderId, 'assistant', reply)
    return reply
  }

  private buildWhatsAppSystemPrompt(senderName?: string): string {
    const name = senderName || 'the user'
    return `You are Zeno, a polite and helpful AI assistant responding through WhatsApp on behalf of Youssef.

Rules:
- You are using LM Studio locally.
- Do not reveal private information about Youssef.
- Do not claim access to Youssef's notes, files, inbox, schedule, finances, health, or relationships.
- Do not execute commands or take actions.
- Keep replies short: 2-4 sentences maximum.
- If asked for private information or direct access to Youssef, politely ask them to use the menu option for leaving a request.
- You are talking with: ${name}.`
  }

  private buildScheduleReply(settings: ZenoSettings): string {
    const active = settings.whatsappScheduleItems.filter(i => i.active)
    if (active.length === 0) {
      return `Youssef has not added a public schedule update right now.\n\nWould you like to choose another option?\n\n${settings.whatsappBusyScript}`
    }
    const list = active.map((item, i) => `${i + 1}. ${item.text}`).join('\n')
    return `Here is what Youssef currently has listed:\n\n${list}\n\nWould you like to choose another option?\n\n${settings.whatsappBusyScript}`
  }

  private sendMenuAndLog(msg: IncomingMessage, settings: ZenoSettings): string {
    this.sessions.updateSession(msg.senderId, { state: 'menu_sent' })
    this.log.log('WHATSAPP_MENU_SENT', `Menu sent to ${msg.senderNumber}`, true, undefined, undefined, msg.senderId)
    return settings.whatsappBusyScript
  }

  onNewRequest?: (data: {
    senderName: string
    senderNumber: string
    topic: string
    urgency: string
    message: string
    responsePref: string
  }) => void
}
