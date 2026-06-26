/**
 * ClaudeClient
 * Handles all Anthropic Claude API communication.
 *
 * SECURITY RULES:
 * - API key is supplied by the main process from local settings, with .env as fallback.
 * - This module lives in the main process only. Never import in renderer.
 * - The renderer calls IPC into main; Claude network calls stay in this module.
 * - WhatsApp chatbot mode uses this with NO Obsidian context.
 * - Zeno main chat may use this only after explicit user permission for any Obsidian context.
 *
 * FUTURE PHASE (NOT IMPLEMENTED):
 * - Claude-powered code auditing of Zeno itself
 * - Autonomous improvement suggestions (require user approval before any change)
 * - Performance analysis
 */

import https from 'https'

export interface ClaudeMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ClaudeResult {
  success: boolean
  content?: string
  error?: string
  errorType?: 'missing_key' | 'invalid_key' | 'rate_limit' | 'network' | 'unavailable' | 'unknown'
  tokensUsed?: number
}

const CLAUDE_API_URL = 'https://api.anthropic.com'
const CLAUDE_MODEL = 'claude-sonnet-4-20250514'
const MAX_WHATSAPP_TOKENS = 300   // keep WhatsApp replies short
const MAX_CHAT_TOKENS = 1500      // main Zeno chat via Claude

export class ClaudeClient {
  private apiKey: string | null

  constructor(apiKey?: string) {
    this.apiKey = this.resolveKey(apiKey)
  }

  private resolveKey(apiKey?: string): string | null {
    const settingsKey = apiKey?.trim()
    if (settingsKey) return settingsKey
    return process.env.ANTHROPIC_API_KEY?.trim() || null
  }

  setApiKey(apiKey?: string) {
    this.apiKey = this.resolveKey(apiKey)
  }

  reloadKey(apiKey?: string) {
    this.setApiKey(apiKey)
  }

  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey.trim().length > 10
  }

  /**
   * Send a chat completion to Claude.
   * @param systemPrompt - system instructions
   * @param messages - conversation history (user/assistant turns only)
   * @param maxTokens - cap response length
   */
  async chat(
    systemPrompt: string,
    messages: ClaudeMessage[],
    maxTokens = MAX_CHAT_TOKENS
  ): Promise<ClaudeResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'Claude API key is not configured. Add it in Settings or set ANTHROPIC_API_KEY in .env.',
        errorType: 'missing_key',
      }
    }

    const body = JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    })

    return new Promise((resolve) => {
      const req = https.request(
        {
          hostname: 'api.anthropic.com',
          path: '/v1/messages',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey!,
            'anthropic-version': '2023-06-01',
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          let data = ''
          res.on('data', (chunk) => { data += chunk })
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data)

              if (res.statusCode === 200) {
                const text = parsed.content?.[0]?.text || ''
                resolve({
                  success: true,
                  content: text,
                  tokensUsed: parsed.usage?.input_tokens + parsed.usage?.output_tokens,
                })
                return
              }

              // Error status codes
              let errorType: ClaudeResult['errorType'] = 'unknown'
              let errorMsg = parsed.error?.message || `HTTP ${res.statusCode}`

              if (res.statusCode === 401) {
                errorType = 'invalid_key'
                errorMsg = 'Invalid Claude API key. Check the key saved in Settings.'
              } else if (res.statusCode === 429) {
                errorType = 'rate_limit'
                errorMsg = 'Claude API rate limit reached. Please wait before trying again.'
              } else if (res.statusCode === 529 || res.statusCode === 503) {
                errorType = 'unavailable'
                errorMsg = 'Claude API is temporarily overloaded. Try again shortly.'
              }

              resolve({ success: false, error: errorMsg, errorType })
            } catch {
              resolve({ success: false, error: 'Failed to parse Claude API response', errorType: 'unknown' })
            }
          })
        }
      )

      req.on('error', (err) => {
        resolve({
          success: false,
          error: `Network error calling Claude API: ${err.message}`,
          errorType: 'network',
        })
      })

      req.setTimeout(30000, () => {
        req.destroy()
        resolve({ success: false, error: 'Claude API request timed out', errorType: 'network' })
      })

      req.write(body)
      req.end()
    })
  }

  /**
   * WhatsApp chatbot variant â€” strict limits, no private context.
   * Short system prompt, capped tokens.
   */
  async whatsappChat(
    messages: ClaudeMessage[],
    senderName?: string
  ): Promise<ClaudeResult> {
    const name = senderName || 'the user'
    const system = `You are Zeno, a polite and helpful AI assistant. You are currently responding via WhatsApp on behalf of Youssef.

STRICT RULES FOR THIS MODE:
- You are in public-facing WhatsApp chatbot mode.
- Do NOT reveal any private information about Youssef.
- Do NOT access or mention any notes, vault, files, or personal data.
- Do NOT discuss Youssef's private schedule, work, finances, health, or relationships.
- Do NOT execute commands or take any actions.
- Keep responses SHORT â€” 2-4 sentences maximum.
- Be friendly and helpful for general conversation only.
- If asked for private information, politely decline.
- You are talking with: ${name}.`

    return this.chat(system, messages, MAX_WHATSAPP_TOKENS)
  }

  getMaxChatTokens() { return MAX_CHAT_TOKENS }
}

// Singleton export â€” instantiated once in main process
export const claudeClient = new ClaudeClient()
