/**
 * DeveloperMode — read-only project file inspector.
 *
 * Allows Zeno to scan and display its own project source tree.
 * NO file writing, patching, or execution happens here.
 *
 * Future: Claude code-audit mode will hook into this module.
 * TODO (future):
 *   1. scanProject()             ← implemented now
 *   2. readFile()                ← implemented now
 *   3. summarizeFile(path)       ← future (Claude)
 *   4. suggestImprovements()     ← future (Claude)
 *   5. applyPatch(diff)          ← NOT implementing — requires user approval
 *   6. logChange(patch, result)  ← future (Activity Log hook)
 */

import fs from 'fs'
import path from 'path'

export interface FileTreeNode {
  name: string
  path: string
  type: 'file' | 'dir'
  children?: FileTreeNode[]
  size?: number
}

// Directories and files to skip during scan
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.vite',
  '.cache', 'coverage', '.turbo', 'out',
])

const SKIP_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg',
  '.woff', '.woff2', '.ttf', '.eot',
  '.zip', '.tar', '.gz', '.7z',
  '.exe', '.dll', '.so',
  '.map',
])

const MAX_FILE_READ_BYTES = 512_000  // 512 KB limit for single file read
const MAX_DEPTH = 8

function buildTree(
  dirPath: string,
  projectRoot: string,
  depth = 0
): FileTreeNode[] {
  if (depth > MAX_DEPTH) return []

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true })
  } catch {
    return []
  }

  const dirs: FileTreeNode[] = []
  const files: FileTreeNode[] = []

  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.env.example') continue

    const fullPath = path.join(dirPath, entry.name)

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      const children = buildTree(fullPath, projectRoot, depth + 1)
      dirs.push({ name: entry.name, path: fullPath, type: 'dir', children })
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase()
      if (SKIP_EXTENSIONS.has(ext)) continue

      let size: number | undefined
      try {
        size = fs.statSync(fullPath).size
      } catch {
        size = undefined
      }
      files.push({ name: entry.name, path: fullPath, type: 'file', size })
    }
  }

  // Dirs first, then files, both sorted alphabetically
  return [
    ...dirs.sort((a, b) => a.name.localeCompare(b.name)),
    ...files.sort((a, b) => a.name.localeCompare(b.name)),
  ]
}

export function scanProject(projectPath: string): {
  success: boolean
  tree?: FileTreeNode
  error?: string
} {
  if (!projectPath || !projectPath.trim()) {
    return { success: false, error: 'No project path provided.' }
  }

  const resolved = path.resolve(projectPath)

  try {
    const stat = fs.statSync(resolved)
    if (!stat.isDirectory()) {
      return { success: false, error: 'Path is not a directory.' }
    }
  } catch (e) {
    return { success: false, error: `Directory not found: ${resolved}` }
  }

  const children = buildTree(resolved, resolved)
  const root: FileTreeNode = {
    name: path.basename(resolved),
    path: resolved,
    type: 'dir',
    children,
  }

  return { success: true, tree: root }
}

export function readProjectFile(
  filePath: string,
  projectRoot: string
): { success: boolean; content?: string; error?: string } {
  // Safety: ensure the file is inside the project root
  const resolvedFile = path.resolve(filePath)
  const resolvedRoot = path.resolve(projectRoot)

  if (!resolvedFile.startsWith(resolvedRoot)) {
    return { success: false, error: 'Access denied: file is outside project root.' }
  }

  // Block binary extensions
  const ext = path.extname(filePath).toLowerCase()
  if (SKIP_EXTENSIONS.has(ext)) {
    return { success: false, error: `Binary file type (${ext}) not readable.` }
  }

  try {
    const stat = fs.statSync(resolvedFile)
    if (stat.size > MAX_FILE_READ_BYTES) {
      return {
        success: false,
        error: `File too large to display (${(stat.size / 1024).toFixed(0)} KB). Limit is 512 KB.`,
      }
    }

    const content = fs.readFileSync(resolvedFile, 'utf-8')
    return { success: true, content }
  } catch (e) {
    return { success: false, error: `Could not read file: ${String(e)}` }
  }
}
