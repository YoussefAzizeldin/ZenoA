import { ActivityLog } from './activityLog'
import { ClaudeClient } from './claudeClient'
import { LMStudioClient } from './lmStudioClient'
import { EmailMessage, EmailReplyDraft } from './emailTypes'
import { ZenoSettings } from '../settings'

function makeId(): string {
  return `reply-draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export class EmailReplyService {
  constructor(
    private readonly getLmClient: () => LMStudioClient,
    private readonly claude: ClaudeClient,
    private readonly getSettings: () => ZenoSettings,
    private readonly log: ActivityLog
  ) {}

  async draftReply(email: EmailMessage): Promise<EmailReplyDraft> {
    const settings = this.getSettings()
    const system = `You draft concise, professional email replies for Youssef.
Rules:
- Create only the reply body.
- Do not include a subject line.
- Do not invent commitments, dates, attachments, or facts.
- If information is missing, say that Youssef will confirm.
- The user must approve before this is sent.`

    const prompt = `Draft a reply to this email:

From: ${email.from}
Subject: ${email.subject}
Received: ${email.receivedAt || 'Unknown'}

Body:
${email.body}`

    let body = ''
    if (settings.activeProvider === 'claude' && settings.claudeEnabled && this.claude.isConfigured()) {
      const result = await this.claude.chat(system, [{ role: 'user', content: prompt }], 600)
      if (result.success) body = result.content || ''
      else throw new Error(result.error || 'Claude failed to draft reply.')
    } else {
      const result = await this.getLmClient().chatCompletion([
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ], settings.temperature, 600)
      if (result.success) body = result.content || ''
      else throw new Error(result.error || 'LM Studio failed to draft reply.')
    }

    const draft: EmailReplyDraft = {
      id: makeId(),
      provider: email.provider,
      emailId: email.id,
      to: email.from,
      subject: email.subject.toLowerCase().startsWith('re:') ? email.subject : `Re: ${email.subject}`,
      body: body.trim(),
      createdAt: new Date().toISOString(),
    }

    this.log.log('EMAIL_REPLY_DRAFTED', `AI reply drafted for: ${email.subject}`, true, undefined, undefined, email.from)
    return draft
  }
}
