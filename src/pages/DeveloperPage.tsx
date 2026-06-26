import { useState } from 'react'
import { useAppStore } from '../store/appStore'
import type { DevModeFileTree } from '../types'

function FileTreeNode({
  node,
  depth,
  onSelect,
  selected,
}: {
  node: DevModeFileTree
  depth: number
  onSelect: (node: DevModeFileTree) => void
  selected: string | null
}) {
  const [open, setOpen] = useState(depth < 2)
  const indent = depth * 16

  if (node.type === 'dir') {
    return (
      <div>
        <div
          className="filetree-dir"
          style={{ paddingLeft: indent }}
          onClick={() => setOpen(o => !o)}
        >
          <span className="filetree-arrow">{open ? '▾' : '▸'}</span>
          <span className="filetree-dir-name">{node.name}</span>
        </div>
        {open && node.children?.map(child => (
          <FileTreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            onSelect={onSelect}
            selected={selected}
          />
        ))}
      </div>
    )
  }

  return (
    <div
      className={`filetree-file ${selected === node.path ? 'active' : ''}`}
      style={{ paddingLeft: indent + 20 }}
      onClick={() => onSelect(node)}
      title={node.path}
    >
      <span className="filetree-file-name">{node.name}</span>
      {node.size !== undefined && (
        <span className="filetree-file-size">
          {node.size < 1024 ? `${node.size}B` : `${(node.size / 1024).toFixed(1)}K`}
        </span>
      )}
    </div>
  )
}

export default function DeveloperPage() {
  const { settings } = useAppStore()
  const [tree, setTree] = useState<DevModeFileTree | null>(null)
  const [scanning, setScanning] = useState(false)
  const [selectedFile, setSelectedFile] = useState<DevModeFileTree | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [loadingFile, setLoadingFile] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)

  const projectPath = settings?.devModeProjectPath || ''

  const handleScan = async () => {
    if (!projectPath) return
    setScanning(true)
    setScanError(null)
    setTree(null)
    setSelectedFile(null)
    setFileContent(null)
    try {
      const result = await window.zeno.devMode.scanProject(projectPath)
      if (result.success && result.tree) {
        setTree(result.tree)
      } else {
        setScanError(result.error || 'Scan failed')
      }
    } catch (e) {
      setScanError(String(e))
    } finally {
      setScanning(false)
    }
  }

  const handleSelectFile = async (node: DevModeFileTree) => {
    setSelectedFile(node)
    setFileContent(null)
    setLoadingFile(true)
    try {
      const result = await window.zeno.devMode.readFile(node.path)
      if (result.success) {
        setFileContent(result.content || '')
      } else {
        setFileContent(`Error: ${result.error}`)
      }
    } catch (e) {
      setFileContent(`Error: ${String(e)}`)
    } finally {
      setLoadingFile(false)
    }
  }

  const lineCount = fileContent ? fileContent.split('\n').length : 0

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Developer Mode</h1>
          <p className="page-subtitle">Read-only project inspector — no automatic edits</p>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={handleScan}
          disabled={scanning || !projectPath}
          title={!projectPath ? 'Set project path in Settings → System' : ''}
        >
          {scanning ? 'Scanning…' : '↻ Scan Project'}
        </button>
      </div>

      {!projectPath ? (
        <div className="empty-state">
          <div className="empty-state-icon">&lt;/&gt;</div>
          <div className="empty-state-title">Project path not configured</div>
          <div className="empty-state-sub">
            Go to Settings → System and set the Zeno Project Path to enable Developer Mode.
          </div>
        </div>
      ) : (
        <>
          <div className="dev-path-bar">
            <span className="dev-path-label">Project:</span>
            <span className="dev-path-value mono">{projectPath}</span>
          </div>

          {scanError && (
            <div className="conn-status error" style={{ marginBottom: 12 }}>{scanError}</div>
          )}

          {!tree && !scanning && !scanError && (
            <div className="empty-state">
              <div className="empty-state-icon">&lt;/&gt;</div>
              <div className="empty-state-title">Not scanned yet</div>
              <div className="empty-state-sub">Click "Scan Project" to load the file tree.</div>
            </div>
          )}

          {(tree || scanning) && (
            <div className="dev-workspace">
              {/* File tree panel */}
              <div className="dev-tree-panel">
                <div className="dev-panel-header">Files</div>
                <div className="dev-tree-scroll">
                  {scanning && (
                    <div style={{ color: 'var(--text-muted)', padding: 16, fontSize: 12 }}>Scanning…</div>
                  )}
                  {tree && (
                    <FileTreeNode
                      node={tree}
                      depth={0}
                      onSelect={handleSelectFile}
                      selected={selectedFile?.path || null}
                    />
                  )}
                </div>
              </div>

              {/* File content panel */}
              <div className="dev-content-panel">
                {selectedFile ? (
                  <>
                    <div className="dev-panel-header">
                      <span className="dev-file-name">{selectedFile.name}</span>
                      <span className="dev-file-meta">
                        {loadingFile ? 'Loading…' : `${lineCount} lines`}
                      </span>
                    </div>
                    <div className="dev-content-scroll selectable">
                      {loadingFile ? (
                        <div style={{ color: 'var(--text-muted)', padding: 16 }}>Loading…</div>
                      ) : fileContent !== null ? (
                        <pre className="dev-code">{fileContent}</pre>
                      ) : null}
                    </div>
                    <div className="dev-readonly-badge">READ ONLY — edits not applied</div>
                  </>
                ) : (
                  <div className="empty-state" style={{ height: '100%' }}>
                    <div className="empty-state-icon" style={{ fontSize: 24 }}>&lt;/&gt;</div>
                    <div className="empty-state-title">Select a file</div>
                    <div className="empty-state-sub">Click a file in the tree to view its contents.</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Future Claude audit hook placeholder */}
          <div className="dev-future-note">
            {/* TODO: Claude code-audit mode — scan → find issues → suggest patch → approve → apply → log */}
            {/* This is intentionally not implemented yet. */}
          </div>
        </>
      )}
    </div>
  )
}
