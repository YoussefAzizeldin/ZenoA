import { ObsidianManager } from './obsidianManager'
import { ActivityLog } from './activityLog'
import { format } from 'date-fns'

export interface MemoryEntry {
  category: string
  title: string
  content: string
  tags: string[]
}

// Memory categories and their default vault paths
const MEMORY_PATHS: Record<string, string> = {
  'User Profile': 'Zeno/Memory/User Profile',
  'Projects': 'Zeno/Projects',
  'Tasks': 'Zeno/Memory/Tasks',
  'Ideas': 'Zeno/Memory/Ideas',
  'Research': 'Zeno/Research',
  'Zeno Development': 'Zeno/Memory/Zeno Development',
  'Daily Logs': 'Zeno/Daily Logs',
  'Inbox': 'Zeno/Inbox',
}

/**
 * MemoryManager
 * Decides what to save, formats it as Markdown, and writes to Obsidian.
 * Does not auto-save everything — only what the orchestrator decides is important.
 */
export class MemoryManager {
  private obsidian: ObsidianManager
  private log: ActivityLog

  constructor(obsidian: ObsidianManager, log: ActivityLog) {
    this.obsidian = obsidian
    this.log = log
  }

  /**
   * Save a memory to the appropriate vault folder.
   * Title becomes the filename. Category determines the folder.
   */
  async saveMemory(entry: MemoryEntry): Promise<{ success: boolean; path?: string; error?: string }> {
    const folder = MEMORY_PATHS[entry.category] || 'Zeno/Inbox'
    const sanitizedTitle = entry.title.replace(/[<>:"/\\|?*]/g, '-').trim()
    const notePath = `${folder}/${sanitizedTitle}.md`

    const now = format(new Date(), "yyyy-MM-dd'T'HH:mm:ss")
    const tags = ['zeno', 'memory', entry.category.toLowerCase().replace(/\s+/g, '-'), ...entry.tags]
    const uniqueTags = [...new Set(tags)]

    const noteContent = `---
title: "${entry.title}"
date: "${now}"
tags: [${uniqueTags.map(t => `"${t}"`).join(', ')}]
category: "${entry.category}"
---

${entry.content}
`

    const result = await this.obsidian.createNote(notePath, noteContent, false)

    if (!result.success && result.error?.includes('already exists')) {
      // Append to existing note rather than overwriting
      const existing = await this.obsidian.readNote(notePath)
      if (existing.success && existing.content) {
        const appended = existing.content + `\n\n---\n\n*Updated: ${now}*\n\n${entry.content}`
        const fullNote = `---
title: "${entry.title}"
date: "${now}"
tags: [${uniqueTags.map(t => `"${t}"`).join(', ')}]
category: "${entry.category}"
---

${appended}`
        const editResult = await this.obsidian.editNote(notePath, fullNote)
        if (editResult.success) {
          this.log.log('MEMORY_SAVE', `Updated memory: ${notePath}`, true, notePath)
          return { success: true, path: notePath }
        }
      }
    }

    if (result.success) {
      this.log.log('MEMORY_SAVE', `Saved memory: ${notePath}`, true, notePath)
      return { success: true, path: notePath }
    }

    this.log.log('MEMORY_SAVE', `Failed to save memory: ${notePath}`, false, notePath, result.error)
    return { success: false, error: result.error }
  }

  /** Save a daily log entry */
  async saveDailyLog(content: string): Promise<{ success: boolean; path?: string }> {
    const today = format(new Date(), 'yyyy-MM-dd')
    return this.saveMemory({
      category: 'Daily Logs',
      title: `Daily Log ${today}`,
      content,
      tags: ['daily-log', today],
    })
  }

  /**
   * Decide if a conversation is worth saving as a memory.
   * Simple heuristic: if the conversation has substance, save it.
   */
  shouldSaveConversation(messages: Array<{ role: string; content: string }>): boolean {
    const userMessages = messages.filter(m => m.role === 'user')
    if (userMessages.length === 0) return false
    const totalLength = userMessages.reduce((sum, m) => sum + m.content.length, 0)
    return totalLength > 200 // Only save non-trivial conversations
  }
}
