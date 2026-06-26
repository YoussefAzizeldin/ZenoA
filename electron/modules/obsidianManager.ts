import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { ActivityLog } from './activityLog'

export interface NoteResult {
  success: boolean
  content?: string
  frontmatter?: Record<string, unknown>
  error?: string
}

export interface SearchResult {
  filePath: string       // Relative to vault root
  absolutePath: string
  title: string
  snippet: string        // Relevant excerpt
  score: number          // Relevance score (higher = better)
  tags: string[]
  links: string[]        // [[wiki links]] found
}

export interface NoteInfo {
  path: string           // Relative path
  title: string
  tags: string[]
  modified: Date
}

/**
 * ObsidianManager
 * All Obsidian vault operations. Supports read, create, edit, delete,
 * move, rename, and search. Respects permission rules — destructive
 * actions must be confirmed by the Auditor layer before calling here.
 */
export class ObsidianManager {
  private vaultPath: string
  private log: ActivityLog

  constructor(vaultPath: string, log: ActivityLog) {
    this.vaultPath = vaultPath
    this.log = log
  }

  /** Verify the vault directory exists and is readable */
  testVault(): { exists: boolean; path: string; error?: string } {
    try {
      const stat = fs.statSync(this.vaultPath)
      if (!stat.isDirectory()) {
        return { exists: false, path: this.vaultPath, error: 'Path is not a directory' }
      }
      return { exists: true, path: this.vaultPath }
    } catch {
      return { exists: false, path: this.vaultPath, error: `Vault not found at: ${this.vaultPath}` }
    }
  }

  setVaultPath(p: string) { this.vaultPath = p }

  /** Resolve a relative vault path to absolute */
  private resolve(relativePath: string): string {
    if (path.isAbsolute(relativePath)) return relativePath
    return path.join(this.vaultPath, relativePath)
  }

  /** Ensure a directory exists */
  private ensureDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true })
    }
  }

  /** Read a note by relative or absolute path */
  async readNote(filePath: string): Promise<NoteResult> {
    const abs = this.resolve(filePath)
    try {
      const raw = fs.readFileSync(abs, 'utf-8')
      const parsed = matter(raw)
      this.log.log('NOTE_READ', `Read note: ${filePath}`, true, filePath)
      return {
        success: true,
        content: parsed.content,
        frontmatter: parsed.data as Record<string, unknown>,
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      this.log.log('NOTE_READ', `Failed to read: ${filePath}`, false, filePath, msg)
      return { success: false, error: msg }
    }
  }

  /**
   * Create a new note. Will NOT overwrite existing notes without explicit flag.
   * Always use absolute vault-relative paths like "Zeno/Inbox/MyNote.md"
   */
  async createNote(
    relativePath: string,
    content: string,
    overwrite = false
  ): Promise<NoteResult> {
    const abs = this.resolve(relativePath)
    if (fs.existsSync(abs) && !overwrite) {
      return { success: false, error: `Note already exists: ${relativePath}. Use overwrite=true to replace.` }
    }
    try {
      this.ensureDir(path.dirname(abs))
      fs.writeFileSync(abs, content, 'utf-8')
      this.log.log('NOTE_CREATE', `Created note: ${relativePath}`, true, relativePath)
      return { success: true }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      this.log.log('NOTE_CREATE', `Failed to create: ${relativePath}`, false, relativePath, msg)
      return { success: false, error: msg }
    }
  }

  /**
   * Edit (overwrite) an existing note. Caller must have confirmed with user.
   */
  async editNote(relativePath: string, content: string): Promise<NoteResult> {
    const abs = this.resolve(relativePath)
    if (!fs.existsSync(abs)) {
      return { success: false, error: `Note does not exist: ${relativePath}` }
    }
    try {
      fs.writeFileSync(abs, content, 'utf-8')
      this.log.log('NOTE_EDIT', `Edited note: ${relativePath}`, true, relativePath)
      return { success: true }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      this.log.log('NOTE_EDIT', `Failed to edit: ${relativePath}`, false, relativePath, msg)
      return { success: false, error: msg }
    }
  }

  /**
   * Delete a note. Caller MUST have confirmed with user before calling.
   */
  async deleteNote(relativePath: string): Promise<NoteResult> {
    const abs = this.resolve(relativePath)
    if (!fs.existsSync(abs)) {
      return { success: false, error: `Note does not exist: ${relativePath}` }
    }
    try {
      fs.unlinkSync(abs)
      this.log.log('NOTE_DELETE', `Deleted note: ${relativePath}`, true, relativePath)
      return { success: true }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      this.log.log('NOTE_DELETE', `Failed to delete: ${relativePath}`, false, relativePath, msg)
      return { success: false, error: msg }
    }
  }

  /** Rename a note (same directory) */
  async renameNote(relativePath: string, newName: string): Promise<NoteResult> {
    const abs = this.resolve(relativePath)
    const newAbs = path.join(path.dirname(abs), newName)
    try {
      fs.renameSync(abs, newAbs)
      const newRel = path.relative(this.vaultPath, newAbs)
      this.log.log('NOTE_RENAME', `Renamed ${relativePath} → ${newRel}`, true, relativePath)
      return { success: true }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      this.log.log('NOTE_RENAME', `Failed to rename: ${relativePath}`, false, relativePath, msg)
      return { success: false, error: msg }
    }
  }

  /** Move a note to a new directory */
  async moveNote(relativePath: string, newRelativePath: string): Promise<NoteResult> {
    const abs = this.resolve(relativePath)
    const newAbs = this.resolve(newRelativePath)
    try {
      this.ensureDir(path.dirname(newAbs))
      fs.renameSync(abs, newAbs)
      this.log.log('NOTE_MOVE', `Moved ${relativePath} → ${newRelativePath}`, true, relativePath)
      return { success: true }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      this.log.log('NOTE_MOVE', `Failed to move: ${relativePath}`, false, relativePath, msg)
      return { success: false, error: msg }
    }
  }

  /**
   * Search notes using hybrid keyword + metadata matching.
   * Searches: filename, headings, tags, wiki links, content.
   * Returns top N results sorted by relevance score.
   */
  async searchNotes(query: string, topN = 5): Promise<SearchResult[]> {
    const vaultExists = this.testVault()
    if (!vaultExists.exists) return []

    this.log.log('VAULT_SEARCH', `Searching vault for: "${query}"`, true)

    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 1)
    const results: SearchResult[] = []

    const walk = (dir: string): string[] => {
      const files: string[] = []
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue // Skip hidden
          const fullPath = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            files.push(...walk(fullPath))
          } else if (entry.name.endsWith('.md')) {
            files.push(fullPath)
          }
        }
      } catch { /* Skip unreadable dirs */ }
      return files
    }

    const mdFiles = walk(this.vaultPath)

    for (const absPath of mdFiles) {
      try {
        const raw = fs.readFileSync(absPath, 'utf-8')
        const parsed = matter(raw)
        const content = parsed.content
        const frontmatter = parsed.data as Record<string, unknown>
        const relPath = path.relative(this.vaultPath, absPath).replace(/\\/g, '/')
        const title = path.basename(absPath, '.md')

        // Extract tags from frontmatter + inline #tags
        const fmTags: string[] = Array.isArray(frontmatter.tags)
          ? frontmatter.tags.map(String)
          : typeof frontmatter.tags === 'string'
          ? [frontmatter.tags]
          : []
        const inlineTags = (content.match(/#[\w-]+/g) || []).map(t => t.slice(1))
        const tags = [...new Set([...fmTags, ...inlineTags])]

        // Extract wiki links [[...]]
        const links = (content.match(/\[\[([^\]]+)\]\]/g) || [])
          .map(l => l.replace(/\[\[|\]\]/g, ''))

        // Score calculation
        let score = 0
        const lowerContent = content.toLowerCase()
        const lowerTitle = title.toLowerCase()

        for (const term of terms) {
          // Filename match is highest value
          if (lowerTitle.includes(term)) score += 10
          // Tag match
          if (tags.some(tag => tag.toLowerCase().includes(term))) score += 6
          // Wiki link match
          if (links.some(l => l.toLowerCase().includes(term))) score += 4
          // Content match (count occurrences, cap at 5)
          const contentMatches = (lowerContent.split(term).length - 1)
          score += Math.min(contentMatches, 5) * 2
        }

        if (score === 0) continue

        // Extract a relevant snippet around the first term hit
        let snippet = ''
        for (const term of terms) {
          const idx = lowerContent.indexOf(term)
          if (idx !== -1) {
            const start = Math.max(0, idx - 80)
            const end = Math.min(content.length, idx + 200)
            snippet = content.slice(start, end).trim().replace(/\n+/g, ' ')
            if (start > 0) snippet = '...' + snippet
            if (end < content.length) snippet += '...'
            break
          }
        }
        if (!snippet && content.length > 0) {
          snippet = content.slice(0, 200).trim() + (content.length > 200 ? '...' : '')
        }

        results.push({ filePath: relPath, absolutePath: absPath, title, snippet, score, tags, links })
      } catch { /* Skip unreadable files */ }
    }

    // Sort by score desc, return top N
    results.sort((a, b) => b.score - a.score)
    return results.slice(0, topN)
  }

  /** List all notes in the vault (for browsing/indexing) */
  async listNotes(): Promise<NoteInfo[]> {
    const vaultExists = this.testVault()
    if (!vaultExists.exists) return []

    const notes: NoteInfo[] = []
    const walk = (dir: string): void => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue
          const fullPath = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            walk(fullPath)
          } else if (entry.name.endsWith('.md')) {
            const relPath = path.relative(this.vaultPath, fullPath).replace(/\\/g, '/')
            const stat = fs.statSync(fullPath)
            let tags: string[] = []
            try {
              const raw = fs.readFileSync(fullPath, 'utf-8')
              const parsed = matter(raw)
              const fm = parsed.data as Record<string, unknown>
              if (Array.isArray(fm.tags)) tags = fm.tags.map(String)
            } catch { /* ignore */ }
            notes.push({
              path: relPath,
              title: path.basename(entry.name, '.md'),
              tags,
              modified: stat.mtime,
            })
          }
        }
      } catch { /* Skip */ }
    }
    walk(this.vaultPath)
    return notes
  }
}
