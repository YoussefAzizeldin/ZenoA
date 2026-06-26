import { LMStudioClient, ChatMessage } from './lmStudioClient'
import { ClaudeClient, ClaudeMessage } from './claudeClient'
import { ObsidianManager, SearchResult } from './obsidianManager'
import { MemoryManager } from './memoryManager'
import { ActivityLog } from './activityLog'
import { ZenoSettings } from '../settings'

export interface OrchestratorResponse {
  success: boolean
  message?: string
  error?: string
  vaultContextUsed?: boolean
  memoryAction?: string
  tokensUsed?: number
  needsClaudeContextPermission?: boolean  // renderer must ask user before re-sending
  provider?: string
}

/**
 * Orchestrator
 * Routes messages to LM Studio or Claude depending on active provider.
 *
 * Claude + Obsidian context safety:
 * - If provider is Claude and the query needs vault context,
 *   we first return needsClaudeContextPermission=true.
 * - The renderer shows a permission dialog and calls chat:send again
 *   with claudeContextApproved=true in payload.
 * - Only then do we attach vault snippets to the Claude call.
 * - We NEVER send full vault to Claude, only the top-4 search snippets.
 *
 * FUTURE PHASE (not implemented):
 * - Claude-powered code audit of Zeno source
 * - Performance improvement suggestions (read-only, user-approved)
 */
export class Orchestrator {
  private lm: LMStudioClient
  private claude: ClaudeClient
  private obsidian: ObsidianManager
  private memory: MemoryManager
  private log: ActivityLog
  private settings: ZenoSettings

  constructor(
    lm: LMStudioClient,
    claude: ClaudeClient,
    obsidian: ObsidianManager,
    memory: MemoryManager,
    log: ActivityLog,
    settings: ZenoSettings
  ) {
    this.lm = lm
    this.claude = claude
    this.obsidian = obsidian
    this.memory = memory
    this.log = log
    this.settings = settings
  }

  updateSettings(settings: ZenoSettings) {
    this.settings = settings
  }

  async handleUserMessage(
    messages: Array<{ role: string; content: string }>,
    conversationId: string,
    claudeContextApproved = false
  ): Promise<OrchestratorResponse> {
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')
    if (!lastUserMessage) {
      return { success: false, error: 'No user message found' }
    }

    const userQuery = lastUserMessage.content
    const provider = this.settings.activeProvider

    // ── Vault context decision ─────────────────────────────────────────
    const needsVault = this.shouldQueryVault(userQuery)
    let vaultContext = ''
    let vaultContextUsed = false

    if (needsVault) {
      // Claude: require explicit permission before attaching vault context
      if (provider === 'claude' && !claudeContextApproved) {
        this.log.log('CLAUDE_CONTEXT_REQUESTED', 'Obsidian context permission requested for Claude', true)
        return {
          success: false,
          needsClaudeContextPermission: true,
          error: 'Permission required: this query may need Obsidian note snippets to be sent to Claude.',
          provider: 'claude',
        }
      }

      if (provider === 'lmstudio' || (provider === 'claude' && claudeContextApproved)) {
        const searchResults = await this.obsidian.searchNotes(userQuery, 4)
        if (searchResults.length > 0) {
          vaultContext = this.formatVaultContext(searchResults)
          vaultContextUsed = true
          if (provider === 'claude' && claudeContextApproved) {
            this.log.log('CLAUDE_CONTEXT_APPROVED', 'Obsidian context approved and attached for Claude', true)
          }
        }
      }
    }

    // ── Route to provider ──────────────────────────────────────────────
    if (provider === 'claude') {
      return this.callClaude(messages, vaultContext, vaultContextUsed)
    }
    return this.callLMStudio(messages, vaultContext, vaultContextUsed, conversationId)
  }

  // ─── LM Studio call ────────────────────────────────────────────────

  private async callLMStudio(
    messages: Array<{ role: string; content: string }>,
    vaultContext: string,
    vaultContextUsed: boolean,
    conversationId: string
  ): Promise<OrchestratorResponse> {
    const systemContent = this.buildSystemPrompt(vaultContext)
    const typedMessages: ChatMessage[] = [
      { role: 'system', content: systemContent },
      ...messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ]

    this.log.log('LM_CALL', `Sending to LM Studio (${typedMessages.length} msgs)`, true)
    const result = await this.lm.chatCompletion(typedMessages, this.settings.temperature, 2048)

    if (!result.success) {
      this.log.log('LM_ERROR', `LM Studio call failed: ${result.error}`, false)
      return { success: false, error: result.error, provider: 'lmstudio' }
    }

    let memoryAction: string | undefined
    if (this.memory.shouldSaveConversation(messages) && messages.length % 6 === 0) {
      void this.saveConversationSummary(messages, conversationId)
      memoryAction = 'Conversation summary saved to vault'
    }

    return {
      success: true,
      message: result.content,
      vaultContextUsed,
      memoryAction,
      tokensUsed: result.tokensUsed,
      provider: 'lmstudio',
    }
  }

  // ─── Claude call ───────────────────────────────────────────────────

  private async callClaude(
    messages: Array<{ role: string; content: string }>,
    vaultContext: string,
    vaultContextUsed: boolean
  ): Promise<OrchestratorResponse> {
    if (!this.settings.claudeEnabled) {
      return { success: false, error: 'Claude is disabled. Enable it in Settings first.', provider: 'claude' }
    }
    if (!this.claude.isConfigured()) {
      return { success: false, error: 'Claude API key not configured. Add it in Settings.', provider: 'claude' }
    }

    const systemContent = this.buildSystemPrompt(vaultContext)
    const claudeMessages: ClaudeMessage[] = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    this.log.log('CLAUDE_CALL', `Sending to Claude (${claudeMessages.length} msgs, vault=${vaultContextUsed})`, true)
    const result = await this.claude.chat(systemContent, claudeMessages)

    if (!result.success) {
      this.log.log('CLAUDE_ERROR', `Claude call failed: ${result.error}`, false)
      return { success: false, error: result.error, provider: 'claude' }
    }

    return {
      success: true,
      message: result.content,
      vaultContextUsed,
      tokensUsed: result.tokensUsed,
      provider: 'claude',
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────

  private shouldQueryVault(query: string): boolean {
    const lq = query.toLowerCase()
    const vaultTriggers = [
      'note', 'notes', 'obsidian', 'vault', 'wrote', 'remember', 'memory',
      'project', 'task', 'research', 'idea', 'plan', 'log',
      'read', 'find', 'search', 'look up', 'what did i', 'when did i',
      'my ', 'the project', 'the plan', 'the idea', 'the note',
      'bakterium', 'zeno', 'journal', 'daily', 'last time',
      'file', 'document', 'wrote about', 'saved',
    ]
    return vaultTriggers.some(trigger => lq.includes(trigger))
  }

  private formatVaultContext(results: SearchResult[]): string {
    const parts = results.map(r => {
      const tags = r.tags.length > 0 ? `Tags: ${r.tags.join(', ')}\n` : ''
      const links = r.links.length > 0 ? `Links: ${r.links.slice(0, 5).join(', ')}\n` : ''
      return `## Note: ${r.title}\nPath: ${r.filePath}\n${tags}${links}\nContent excerpt:\n${r.snippet}`
    })
    return `--- OBSIDIAN VAULT CONTEXT ---\n${parts.join('\n\n')}\n--- END VAULT CONTEXT ---`
  }

  private buildSystemPrompt(vaultContext: string): string {
    let system = this.settings.systemPrompt
    if (vaultContext) {
      system += `\n\n${vaultContext}\n\nUse the above vault context to inform your answer. Reference specific notes by name when relevant.`
    }
    return system
  }

  private async saveConversationSummary(
    messages: Array<{ role: string; content: string }>,
    conversationId: string
  ): Promise<void> {
    const transcript = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-8)
      .map(m => `**${m.role === 'user' ? 'User' : 'Zeno'}:** ${m.content}`)
      .join('\n\n')
    await this.memory.saveMemory({
      category: 'Daily Logs',
      title: `Conversation ${conversationId.slice(0, 8)}`,
      content: `Conversation excerpt (auto-saved by Zeno):\n\n${transcript}`,
      tags: ['conversation', 'auto-saved'],
    })
  }
}
