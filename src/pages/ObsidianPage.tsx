import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/appStore'
import type { ObsidianGraphNode } from '../types'

// Simple force-directed layout using Canvas
function GraphCanvas({
  nodes,
  onNodeClick,
}: {
  nodes: ObsidianGraphNode[]
  onNodeClick: (node: ObsidianGraphNode) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animFrameRef = useRef<number>(0)
  const stateRef = useRef<{
    positions: Map<string, { x: number; y: number; vx: number; vy: number }>
    scale: number
    offsetX: number
    offsetY: number
    dragging: boolean
    lastMouse: { x: number; y: number }
  }>({
    positions: new Map(),
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    dragging: false,
    lastMouse: { x: 0, y: 0 },
  })

  useEffect(() => {
    if (!nodes.length) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const s = stateRef.current
    const W = canvas.width
    const H = canvas.height

    // Initialize positions randomly if not set
    nodes.forEach(node => {
      if (!s.positions.has(node.id)) {
        s.positions.set(node.id, {
          x: W / 2 + (Math.random() - 0.5) * 400,
          y: H / 2 + (Math.random() - 0.5) * 400,
          vx: 0,
          vy: 0,
        })
      }
    })

    // Build adjacency
    const linkMap = new Map<string, string[]>()
    nodes.forEach(node => {
      linkMap.set(node.id, node.links || [])
    })

    let iteration = 0
    const MAX_ITER = 200
    const K = 80 // spring rest length
    const REPULSE = 8000

    function simulate() {
      if (iteration >= MAX_ITER) {
        draw()
        return
      }
      iteration++

      // Repulsion between all pairs
      const posArr = Array.from(s.positions.entries())
      for (let i = 0; i < posArr.length; i++) {
        const [idA, pA] = posArr[i]
        for (let j = i + 1; j < posArr.length; j++) {
          const [idB, pB] = posArr[j]
          const dx = pA.x - pB.x
          const dy = pA.y - pB.y
          const d = Math.sqrt(dx * dx + dy * dy) || 0.1
          const force = REPULSE / (d * d)
          pA.vx += (dx / d) * force
          pA.vy += (dy / d) * force
          pB.vx -= (dx / d) * force
          pB.vy -= (dy / d) * force
          s.positions.set(idA, pA)
          s.positions.set(idB, pB)
        }
      }

      // Attraction along links
      nodes.forEach(node => {
        const pA = s.positions.get(node.id)!
        ;(node.links || []).forEach(targetId => {
          const pB = s.positions.get(targetId)
          if (!pB) return
          const dx = pB.x - pA.x
          const dy = pB.y - pA.y
          const d = Math.sqrt(dx * dx + dy * dy) || 0.1
          const force = (d - K) * 0.04
          pA.vx += (dx / d) * force
          pA.vy += (dy / d) * force
          pB.vx -= (dx / d) * force
          pB.vy -= (dy / d) * force
          s.positions.set(node.id, pA)
          s.positions.set(targetId, pB)
        })
      })

      // Gravity toward center
      s.positions.forEach((p, id) => {
        const cx = W / 2, cy = H / 2
        p.vx += (cx - p.x) * 0.001
        p.vy += (cy - p.y) * 0.001
        // Dampen + integrate
        p.vx *= 0.85
        p.vy *= 0.85
        p.x += p.vx
        p.y += p.vy
        s.positions.set(id, p)
      })

      draw()
      animFrameRef.current = requestAnimationFrame(simulate)
    }

    function draw() {
      ctx.clearRect(0, 0, W, H)
      ctx.save()
      ctx.translate(s.offsetX, s.offsetY)
      ctx.scale(s.scale, s.scale)

      // Draw edges
      ctx.strokeStyle = 'rgba(139,92,246,0.18)'
      ctx.lineWidth = 0.8 / s.scale
      nodes.forEach(node => {
        const pA = s.positions.get(node.id)
        if (!pA) return
        ;(node.links || []).forEach(targetId => {
          const pB = s.positions.get(targetId)
          if (!pB) return
          ctx.beginPath()
          ctx.moveTo(pA.x, pA.y)
          ctx.lineTo(pB.x, pB.y)
          ctx.stroke()
        })
      })

      // Draw nodes
      nodes.forEach(node => {
        const p = s.positions.get(node.id)
        if (!p) return
        const r = node.links?.length ? Math.min(3 + node.links.length * 0.8, 10) : 3.5
        ctx.beginPath()
        ctx.arc(p.x, p.y, r / s.scale, 0, Math.PI * 2)
        ctx.fillStyle = node.links?.length ? 'rgba(139,92,246,0.9)' : 'rgba(100,100,160,0.6)'
        ctx.fill()
        // Label for larger nodes
        if (r > 5 && s.scale > 0.5) {
          ctx.fillStyle = 'rgba(200,200,230,0.7)'
          ctx.font = `${10 / s.scale}px Inter, sans-serif`
          ctx.fillText(node.label.slice(0, 20), p.x + r / s.scale + 2, p.y + 4 / s.scale)
        }
      })

      ctx.restore()
    }

    animFrameRef.current = requestAnimationFrame(simulate)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [nodes])

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const s = stateRef.current
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    s.scale = Math.max(0.1, Math.min(5, s.scale * delta))
  }

  // Pan
  const handleMouseDown = (e: React.MouseEvent) => {
    stateRef.current.dragging = true
    stateRef.current.lastMouse = { x: e.clientX, y: e.clientY }
  }
  const handleMouseMove = (e: React.MouseEvent) => {
    const s = stateRef.current
    if (!s.dragging) return
    s.offsetX += e.clientX - s.lastMouse.x
    s.offsetY += e.clientY - s.lastMouse.y
    s.lastMouse = { x: e.clientX, y: e.clientY }
  }
  const handleMouseUp = (e: React.MouseEvent) => {
    const s = stateRef.current
    s.dragging = false
    // Click detection (small movement = click)
    const dx = e.clientX - s.lastMouse.x
    const dy = e.clientY - s.lastMouse.y
    if (Math.abs(dx) < 3 && Math.abs(dy) < 3) {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const mx = (e.clientX - rect.left - s.offsetX) / s.scale
      const my = (e.clientY - rect.top - s.offsetY) / s.scale
      for (const node of nodes) {
        const p = s.positions.get(node.id)
        if (!p) continue
        const dist = Math.sqrt((mx - p.x) ** 2 + (my - p.y) ** 2)
        if (dist < 12) { onNodeClick(node); break }
      }
    }
  }

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={520}
      style={{ width: '100%', height: '100%', cursor: 'grab', borderRadius: 8 }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    />
  )
}

export default function ObsidianPage() {
  const { settings, connection, obsidianGraph, obsidianGraphLoading, setObsidianGraph, setObsidianGraphLoading } = useAppStore()
  const [selectedNode, setSelectedNode] = useState<ObsidianGraphNode | null>(null)
  const [notePreview, setNotePreview] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const vaultPath = settings?.obsidianVaultPath || ''
  const vaultOk = connection.obsidian === 'found'

  const scanVault = async () => {
    if (!vaultOk) return
    setObsidianGraphLoading(true)
    try {
      const data = await window.zeno.obsidian.graph()
      setObsidianGraph(data)
    } catch (e) {
      console.error('Graph scan failed:', e)
    } finally {
      setObsidianGraphLoading(false)
    }
  }

  useEffect(() => {
    if (vaultOk && !obsidianGraph) {
      scanVault()
    }
  }, [vaultOk])

  const handleNodeClick = async (node: ObsidianGraphNode) => {
    setSelectedNode(node)
    setNotePreview(null)
    setPreviewLoading(true)
    try {
      const result = await window.zeno.obsidian.readNote(node.path)
      if (result.success && result.content) {
        setNotePreview(result.content.slice(0, 1200))
      } else {
        setNotePreview('Could not read note.')
      }
    } catch {
      setNotePreview('Error reading note.')
    } finally {
      setPreviewLoading(false)
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Obsidian Memory</h1>
          <p className="page-subtitle">Second brain — knowledge graph and vault explorer</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={scanVault} disabled={obsidianGraphLoading || !vaultOk}>
          {obsidianGraphLoading ? 'Scanning…' : '↻ Rescan'}
        </button>
      </div>

      {/* Vault stats */}
      <div className="obsidian-stats-row">
        <div className="obsidian-stat">
          <span className="obsidian-stat-label">Vault Path</span>
          <span className="obsidian-stat-value mono" title={vaultPath}>
            {vaultPath || 'Not configured'}
          </span>
        </div>
        <div className="obsidian-stat">
          <span className="obsidian-stat-label">Status</span>
          <span className="obsidian-stat-value" style={{ color: vaultOk ? 'var(--success)' : 'var(--error)' }}>
            {vaultOk ? '● Found' : '● Not found'}
          </span>
        </div>
        {obsidianGraph && (
          <>
            <div className="obsidian-stat">
              <span className="obsidian-stat-label">Notes</span>
              <span className="obsidian-stat-value">{obsidianGraph.totalNotes}</span>
            </div>
            <div className="obsidian-stat">
              <span className="obsidian-stat-label">Links</span>
              <span className="obsidian-stat-value">{obsidianGraph.totalLinks}</span>
            </div>
            <div className="obsidian-stat">
              <span className="obsidian-stat-label">Last scan</span>
              <span className="obsidian-stat-value">
                {new Date(obsidianGraph.scanTime).toLocaleTimeString()}
              </span>
            </div>
          </>
        )}
      </div>

      {!vaultOk ? (
        <div className="empty-state">
          <div className="empty-state-icon">⬡</div>
          <div className="empty-state-title">Vault not found</div>
          <div className="empty-state-sub">
            Configure your Obsidian vault path in Settings to enable the memory graph.
          </div>
        </div>
      ) : obsidianGraphLoading && !obsidianGraph ? (
        <div className="empty-state">
          <div className="empty-state-icon" style={{ animation: 'spin 2s linear infinite' }}>↻</div>
          <div className="empty-state-title">Scanning vault…</div>
          <div className="empty-state-sub">Building knowledge graph. This may take a moment.</div>
        </div>
      ) : (
        <div className="obsidian-main">
          {/* Graph */}
          <div className="obsidian-graph-container">
            {obsidianGraph && obsidianGraph.nodes.length > 0 ? (
              <>
                <div className="obsidian-graph-hint">
                  Scroll to zoom · Drag to pan · Click a node to preview
                </div>
                <GraphCanvas nodes={obsidianGraph.nodes} onNodeClick={handleNodeClick} />
              </>
            ) : (
              <div className="empty-state" style={{ height: '100%' }}>
                <div className="empty-state-icon">⬡</div>
                <div className="empty-state-title">No notes found</div>
                <div className="empty-state-sub">Your vault appears empty or no .md files were found.</div>
              </div>
            )}
          </div>

          {/* Side panel: selected node */}
          {selectedNode && (
            <div className="obsidian-preview-panel">
              <div className="obsidian-preview-header">
                <span className="obsidian-preview-title">{selectedNode.label}</span>
                <button className="btn-icon" onClick={() => setSelectedNode(null)}>✕</button>
              </div>

              <div className="obsidian-preview-meta">
                <div className="obsidian-preview-path">{selectedNode.path}</div>
                {selectedNode.tags.length > 0 && (
                  <div className="obsidian-preview-tags">
                    {selectedNode.tags.map(tag => (
                      <span key={tag} className="obsidian-tag">#{tag}</span>
                    ))}
                  </div>
                )}
                {selectedNode.links.length > 0 && (
                  <div className="obsidian-preview-links-count">
                    {selectedNode.links.length} link{selectedNode.links.length !== 1 ? 's' : ''}
                  </div>
                )}
              </div>

              <div className="obsidian-preview-content selectable">
                {previewLoading ? (
                  <span style={{ color: 'var(--text-muted)' }}>Loading…</span>
                ) : notePreview ? (
                  <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 12, lineHeight: 1.6 }}>{notePreview}</pre>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>Select a node to preview</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
