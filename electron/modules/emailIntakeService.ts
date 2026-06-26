import { EmailAnalysis, EmailMessage, EmailProviderStatus, EmailReadResult } from './emailTypes'
import { EmailReplyService } from './emailReplyService'
import { EmailSummaryService } from './emailSummaryService'
import { EmailTaskExtractor } from './emailTaskExtractor'
import { ManualEmailInput, ManualEmailProvider } from './manualEmailProvider'
import { OutlookDesktopProvider } from './outlookDesktopProvider'

export class EmailIntakeService {
  constructor(
    private readonly outlookDesktopProvider: OutlookDesktopProvider,
    private readonly manualEmailProvider: ManualEmailProvider,
    private readonly emailSummaryService: EmailSummaryService,
    private readonly emailTaskExtractor: EmailTaskExtractor,
    private readonly emailReplyService: EmailReplyService
  ) {}

  async providerStatuses(): Promise<EmailProviderStatus[]> {
    const outlook = await this.outlookDesktopProvider.status()
    const manual = this.manualEmailProvider.status()
    return [
      outlook,
      manual,
      {
        provider: 'graph-future',
        available: false,
        message: 'Microsoft Graph is reserved for a future provider and is not used by this build.',
      },
    ]
  }

  async readOutlookRecent(limit: number): Promise<EmailReadResult> {
    return this.outlookDesktopProvider.readRecent(limit)
  }

  async readOutlookUnread(limit: number): Promise<EmailReadResult> {
    return this.outlookDesktopProvider.readUnread(limit)
  }

  listManual(): EmailMessage[] {
    return this.manualEmailProvider.list()
  }

  importManual(input: ManualEmailInput): EmailMessage {
    return this.manualEmailProvider.importEmail(input)
  }

  async analyze(message: EmailMessage): Promise<EmailAnalysis> {
    const summary = await this.emailSummaryService.summarize(message)
    const extracted = await this.emailTaskExtractor.extract(message, summary)
    return {
      emailId: message.id,
      summary,
      signals: extracted.signals,
      suggestions: extracted.suggestions,
    }
  }

  async draftReply(message: EmailMessage) {
    return this.emailReplyService.draftReply(message)
  }

  async sendApprovedReply(message: EmailMessage, body: string) {
    if (message.provider !== 'outlook-desktop') {
      return { success: false, error: 'Only Outlook Desktop replies can be sent from Zeno.' }
    }
    return this.outlookDesktopProvider.sendApprovedReply(message, body)
  }
}
