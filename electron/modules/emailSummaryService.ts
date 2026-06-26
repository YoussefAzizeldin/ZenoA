import { ActivityLog } from './activityLog'
import { ClaudeClient } from './claudeClient'
import { LMStudioClient } from './lmStudioClient'
import { ZenoSettings } from '../settings'
import { EmailMessage } from './emailTypes'

export class EmailSummaryService {
  constructor(
    private readonly getLmClient: () => LMStudioClient,
    private readonly claude: ClaudeClient,
    private readonly getSettings: () => ZenoSettings,
    private readonly log: ActivityLog
  ) {}

  async summarize(email: EmailMessage): Promise<string> {
    const fallback = this.fallbackSummary(email)
    const settings = this.getSettings()
    const system = 'You summarize email for a local-first task intake tool. Be concise. Do not draft or send replies.'
    const prompt = `Summarize this email in 3 concise bullets. Identify sender intent, deadline if any, and urgency.

From: ${email.from}
Subject: ${email.subject}
Received: ${email.receivedAt || 'Unknown'}

Body:
${email.body}`

    try {
      if (settings.activeProvider === 'claude' && settings.claudeEnabled && this.claude.isConfigured()) {
        const result = await this.claude.chat(system, [{ role: 'user', content: prompt }], 500)
        if (result.success && result.content?.trim()) {
          this.log.log('EMAIL_ANALYZED', `Email summarized with Claude: ${email.subject}`, true, undefined, undefined, email.from)
          return result.content.trim()
        }
      } else {
        const result = await this.getLmClient().chatCompletion([
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ], settings.temperature, 500)
        if (result.success && result.content?.trim()) {
          this.log.log('EMAIL_ANALYZED', `Email summarized with LM Studio: ${email.subject}`, true, undefined, undefined, email.from)
          return result.content.trim()
        }
      }
    } catch (error) {
      this.log.log('EMAIL_PROVIDER_ERROR', `Email summary failed: ${String(error)}`, false)
    }

    this.log.log('EMAIL_ANALYZED', `Email summarized with local fallback: ${email.subject}`, true, undefined, undefined, email.from)
    return fallback
  }

  private fallbackSummary(email: EmailMessage): string {
    const cleanBody = email.body.replace(/\s+/g, ' ').trim()
    const preview = cleanBody.length > 220 ? `${cleanBody.slice(0, 220)}...` : cleanBody
    return [
      `From: ${email.from}`,
      `Subject: ${email.subject || '(No subject)'}`,
      preview ? `Preview: ${preview}` : 'Preview: No body text was included.',
    ].join('\n')
  }
}
