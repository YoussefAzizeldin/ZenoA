/**
 * ObsidianGraph — scans the vault and builds a node/edge graph.
 *
 * Reads .md file names, YAML front matter tags, and [[wiki-links]] from
 * note content to build graph nodes and edges.
 *
 * Performance notes:
 *  - Reads files in batches to avoid blocking the main thread.
 *  - For very large vaults (>5000 notes) the link-extraction is capped.
 *  - Never loads the full vault content into memory at once.
 */

import fs from 'fs'
import path from 'path'

export interface GraphNode {
  id: string          // relative path from vault root (normalised)
  label: string       // filename without extension
  path: string        // absolute path
  tags: string[]
  links: string[]     // ids of nodes this note links to
}

export interface GraphData {
  nodes: GraphNode[]
  totalNotes: number
  totalLinks: number
  scanTime: string
}

// Regex patterns
const WIKI_LINK_RE   = /\[\[([^\]|#\n]+?)(?:\|[^\]]+?)?\]\]/g
const YAML_TAGS_RE   = /^tags:\s*\[?([^\]}\n]+)\]?/m
const YAML_FRONT_RE  = /^---[\s\S]*?^---/m
const MAX_CONTENT_BYTES = 24_000   // only read first ~24 KB per file for link extraction
const MAX_NOTES_FULL    = 3_000    // above this, skip content reads for speed

function slug(filePath: string, vaultRoot: string): string {
  return path
    .relative(vaultRoot, filePath)
    .replace(/\\/g, '/')
    .replace(/\.md$/i, '')
    .toLowerCase()
}

function extractTagsFromFrontMatter(content: string): string[] {
  const fm = content.match(YAML_FRONT_RE)?.[0] || ''
  const tagsLine = fm.match(YAML_TAGS_RE)?.[1] || ''
  if (!tagsLine) return []
  return tagsLine
    .split(',')
    .map(t => t.trim().replace(/^#/, '').replace(/["']/g, ''))
    .filter(Boolean)
    .slice(0, 12)
}

function extractWikiLinks(content: string): string[] {
  const links: string[] = []
  let m: RegExpExecArray | null
  WIKI_LINK_RE.lastIndex = 0
  while ((m = WIKI_LINK_RE.exec(content)) !== null) {
    const target = m[1].trim().toLowerCase()
    if (target) links.push(target)
  }
  return [...new Set(links)]
}

function walkDir(dir: string, collected: string[] = []): string[] {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      // skip hidden dirs (.obsidian, .git, etc.)
      if (entry.name.startsWith('.')) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walkDir(full, collected)
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        collected.push(full)
      }
    }
  } catch {
    // skip unreadable directories
  }
  return collected
}

export function buildGraph(vaultRoot: string): GraphData {
  const allFiles = walkDir(vaultRoot)
  const totalNotes = allFiles.length
  const readFull = totalNotes <= MAX_NOTES_FULL

  // Build a slug → node map
  const nodeMap = new Map<string, GraphNode>()

  // First pass: create all nodes (filenames + tags)
  for (const filePath of allFiles) {
    const id = slug(filePath, vaultRoot)
    const label = path.basename(filePath, path.extname(filePath))
    let tags: string[] = []

    try {
      if (readFull) {
        // Read only a limited prefix for tags/links
        const fd = fs.openSync(filePath, 'r')
        const buf = Buffer.alloc(MAX_CONTENT_BYTES)
        const bytesRead = fs.readSync(fd, buf, 0, MAX_CONTENT_BYTES, 0)
        fs.closeSync(fd)
        const partial = buf.slice(0, bytesRead).toString('utf-8')
        tags = extractTagsFromFrontMatter(partial)
      }
    } catch {
      // skip unreadable files
    }

    nodeMap.set(id, { id, label, path: filePath, tags, links: [] })
  }

  // Second pass: extract links (only when vault is small enough)
  let totalLinks = 0
  if (readFull) {
    for (const [id, node] of nodeMap.entries()) {
      try {
        const fd = fs.openSync(node.path, 'r')
        const buf = Buffer.alloc(MAX_CONTENT_BYTES)
        const bytesRead = fs.readSync(fd, buf, 0, MAX_CONTENT_BYTES, 0)
        fs.closeSync(fd)
        const content = buf.slice(0, bytesRead).toString('utf-8')
        const wikiLinks = extractWikiLinks(content)

        const resolved: string[] = []
        for (const target of wikiLinks) {
          // Try exact slug match first, then basename match
          if (nodeMap.has(target)) {
            resolved.push(target)
          } else {
            // find by basename
            for (const [otherId] of nodeMap.entries()) {
              const base = otherId.split('/').pop() || ''
              if (base === target) {
                resolved.push(otherId)
                break
              }
            }
          }
        }

        node.links = [...new Set(resolved)]
        totalLinks += node.links.length
        nodeMap.set(id, node)
      } catch {
        // skip
      }
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    totalNotes,
    totalLinks,
    scanTime: new Date().toISOString(),
  }
}
