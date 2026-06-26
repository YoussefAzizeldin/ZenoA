import { useState, useEffect } from 'react'
import { useAppStore } from '../store/appStore'
import type { ZenoSettings, AIProvider } from '../types'

type Tab = 'provider' | 'lmstudio' | 'obsidian' | 'whatsapp-settings' | 'bridge' | 'system'

export default function SettingsPage() {
  const { settings, setSettings, setConnection } = useAppStore()
  const [tab, setTab] = useState<Tab>('provider')
  const [form, setForm] = useState<ZenoSettings>({} as ZenoSettings)
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [lmStatus, setLmStatus] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [obStatus, setObStatus] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [claudeStatus, setClaudeStatus] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [bridgeStatus, setBridgeStatus] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const defaults: ZenoSettings = {
    lmStudioBaseUrl: 'http://localhost:1234/v1',
    lmStudioModel: '', obsidianVaultPath: '', systemPrompt: '',
    maxContextTokens: 4000, temperature: 0.7, theme: 'dark',
    activeProvider: 'lmstudio', claudeEnabled: false, claudeApiKey: '',
    whatsappEnabled: false, whatsappAutoReply: true,
    whatsappBusyScript: '', whatsappZenoDescription: '', whatsappScheduleItems: [],
    pcBridgeEnabled: false, pcBridgeUrl: 'http://localhost:7788',
    devModeProjectPath: '',
  }

  useEffect(() => {
    if (settings) setForm({ ...defaults, ...settings })
  }, [settings])

  const update = <K extends keyof ZenoSettings>(key: K, value: ZenoSettings[K]) =>
    setForm(prev => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await window.zeno.settings.save(form)
      setSettings(form)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      setConnection({ activeProvider: form.activeProvider })
    } catch (e) {
      console.error('Save failed:', e)
    } finally {
      setSaving(false)
    }
  }

  const handleTestLm = async () => {
    setTesting('lm'); setLmStatus({ type: 'info', text: 'Connecting to LM Studio…' })
    try {
      await window.zeno.settings.save({ lmStudioBaseUrl: form.lmStudioBaseUrl })
      const result = await window.zeno.lmstudio.test()
      if (result.connected) {
        setLmStatus({ type: 'success', text: `Connected. Models: ${result.models?.join(', ') || 'none'}` })
        setConnection({ lmStudio: 'connected' })
        if (result.models?.length) setAvailableModels(result.models)
      } else {
        setLmStatus({ type: 'error', text: result.error || 'Could not connect' })
        setConnection({ lmStudio: 'disconnected' })
      }
    } catch (e) { setLmStatus({ type: 'error', text: String(e) }) }
    finally { setTesting(null) }
  }

  const handleFetchModels = async () => {
    setTesting('models'); setLmStatus({ type: 'info', text: 'Fetching models…' })
    try {
      const result = await window.zeno.lmstudio.models()
      if (result.success && result.models.length) {
        setAvailableModels(result.models)
        setLmStatus({ type: 'success', text: `Found ${result.models.length} model(s)` })
      } else {
        setLmStatus({ type: 'error', text: result.error || 'No models found' })
      }
    } catch (e) { setLmStatus({ type: 'error', text: String(e) }) }
    finally { setTesting(null) }
  }

  const handleTestOb = async () => {
    setTesting('ob'); setObStatus({ type: 'info', text: 'Checking vault…' })
    try {
      await window.zeno.settings.save({ obsidianVaultPath: form.obsidianVaultPath })
      const result = await window.zeno.obsidian.test()
      if (result.exists) {
        setObStatus({ type: 'success', text: `Vault found at: ${result.path}` })
        setConnection({ obsidian: 'found' })
      } else {
        setObStatus({ type: 'error', text: result.error || 'Vault not found' })
        setConnection({ obsidian: 'not_found' })
      }
    } catch (e) { setObStatus({ type: 'error', text: String(e) }) }
    finally { setTesting(null) }
  }

  const handleBrowse = async () => {
    const path = await window.zeno.obsidian.browse()
    if (path) update('obsidianVaultPath', path)
  }

  const handleTestClaude = async () => {
    setTesting('claude'); setClaudeStatus({ type: 'info', text: 'Testing Claude API…' })
    try {
      await window.zeno.settings.save({
        claudeApiKey: form.claudeApiKey,
        claudeEnabled: form.claudeEnabled,
      })
      const result = await window.zeno.provider.testClaude()
      if (result.connected) {
        setClaudeStatus({ type: 'success', text: 'Claude API key is valid.' })
        setConnection({ claude: 'configured' })
      } else {
        setClaudeStatus({ type: 'error', text: result.error || 'Claude API key invalid or missing' })
      }
    } catch (e) { setClaudeStatus({ type: 'error', text: String(e) }) }
    finally { setTesting(null) }
  }

  const handleTestBridge = async () => {
    setTesting('bridge'); setBridgeStatus({ type: 'info', text: 'Checking bridge…' })
    try {
      await window.zeno.settings.save({ pcBridgeUrl: form.pcBridgeUrl, pcBridgeEnabled: form.pcBridgeEnabled })
      const result = await window.zeno.bridge.health()
      if (result.connected) {
        setBridgeStatus({ type: 'success', text: 'PC Bridge is reachable.' })
        setConnection({ bridge: 'connected' })
      } else {
        setBridgeStatus({ type: 'error', text: result.error || 'Bridge not reachable' })
        setConnection({ bridge: 'disconnected' })
      }
    } catch (e) { setBridgeStatus({ type: 'error', text: String(e) }) }
    finally { setTesting(null) }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'provider', label: 'AI Provider' },
    { id: 'lmstudio', label: 'LM Studio' },
    { id: 'obsidian', label: 'Obsidian' },
    { id: 'whatsapp-settings', label: 'WhatsApp' },
    { id: 'bridge', label: 'PC Bridge' },
    { id: 'system', label: 'System' },
  ]

  const StatusMsg = ({ status }: { status: { type: string; text: string } | null }) =>
    status ? <div className={`conn-status ${status.type}`}>{status.text}</div> : null

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Configure Zeno — changes require Save to apply</p>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Settings'}
        </button>
      </div>

      {/* Tab bar */}
      <div className="settings-tabs">
        {tabs.map(t => (
          <button
            key={t.id}
            className={`settings-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="settings-body">

        {/* ── AI Provider ─────────────────────────────── */}
        {tab === 'provider' && (
          <div className="settings-section">
            <div className="section-header">Active Provider</div>
            <div className="provider-cards">
              <div
                className={`provider-card ${form.activeProvider === 'lmstudio' ? 'active' : ''}`}
                onClick={() => update('activeProvider', 'lmstudio')}
              >
                {form.activeProvider === 'lmstudio' && <div className="provider-active-badge">ACTIVE</div>}
                <div className="provider-card-title">LM Studio</div>
                <div className="provider-card-desc">Default provider. Runs locally via OpenAI-compatible API. Full Obsidian context access.</div>
              </div>
              <div
                className={`provider-card ${form.activeProvider === 'claude' ? 'active' : ''}`}
                onClick={() => update('activeProvider', 'claude')}
              >
                {form.activeProvider === 'claude' && <div className="provider-active-badge">ACTIVE</div>}
                <div className="provider-card-title">Claude API</div>
                <div className="provider-card-desc">Optional cloud provider. Requires an API key. Obsidian context requires permission per request.</div>
              </div>
            </div>

            <div className="divider" />

            <div className="section-header">Claude API Key</div>
            <div className="info-box" style={{ marginBottom: 16 }}>
              The Claude API key is stored locally in Zeno settings and sent to Claude only from the Electron main process.
            </div>

            <div className="form-group">
              <label className="toggle-row">
                <span className="form-label" style={{ margin: 0 }}>Enable Claude API</span>
                <input type="checkbox" checked={!!form.claudeEnabled} onChange={e => update('claudeEnabled', e.target.checked)} />
              </label>
            </div>

            <div className="form-group">
              <label className="form-label">API Key</label>
              <input
                className="form-input"
                type="password"
                value={form.claudeApiKey || ''}
                onChange={e => update('claudeApiKey', e.target.value)}
                placeholder="sk-ant-..."
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Verify Claude Key</label>
              <div className="form-row">
                <button className="btn btn-secondary" onClick={handleTestClaude} disabled={testing === 'claude'}>
                  {testing === 'claude' ? 'Testing…' : 'Test Claude API'}
                </button>
              </div>
              <StatusMsg status={claudeStatus} />
            </div>
          </div>
        )}

        {/* ── LM Studio ───────────────────────────────── */}
        {tab === 'lmstudio' && (
          <div className="settings-section">
            <div className="section-header">LM Studio Connection</div>

            <div className="form-group">
              <label className="form-label">Base URL</label>
              <div className="form-row">
                <input
                  className="form-input"
                  value={form.lmStudioBaseUrl || ''}
                  onChange={e => update('lmStudioBaseUrl', e.target.value)}
                  placeholder="http://localhost:1234/v1"
                />
                <button className="btn btn-secondary btn-sm" onClick={handleTestLm} disabled={testing === 'lm'}>
                  {testing === 'lm' ? '…' : 'Test'}
                </button>
              </div>
              <StatusMsg status={lmStatus} />
            </div>

            <div className="form-group">
              <label className="form-label">Model</label>
              {availableModels.length > 0 ? (
                <select
                  className="form-select"
                  value={form.lmStudioModel || ''}
                  onChange={e => update('lmStudioModel', e.target.value)}
                >
                  <option value="">— Select model —</option>
                  {availableModels.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              ) : (
                <input
                  className="form-input"
                  value={form.lmStudioModel || ''}
                  onChange={e => update('lmStudioModel', e.target.value)}
                  placeholder="e.g. lmstudio-community/Meta-Llama-3-8B-Instruct"
                />
              )}
              <button
                className="btn btn-secondary btn-sm"
                style={{ marginTop: 8 }}
                onClick={handleFetchModels}
                disabled={testing === 'models'}
              >
                {testing === 'models' ? 'Fetching…' : '↻ Refresh Models'}
              </button>
            </div>

            <div className="divider" />

            <div className="section-header">Generation</div>
            <div className="form-group">
              <label className="form-label">Max Context Tokens</label>
              <input
                className="form-input"
                type="number"
                value={form.maxContextTokens || 4000}
                onChange={e => update('maxContextTokens', parseInt(e.target.value) || 4000)}
                min={512} max={32000} step={512}
                style={{ maxWidth: 160 }}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Temperature</label>
              <input
                className="form-input"
                type="number"
                value={form.temperature ?? 0.7}
                onChange={e => update('temperature', parseFloat(e.target.value))}
                min={0} max={2} step={0.05}
                style={{ maxWidth: 120 }}
              />
            </div>
          </div>
        )}

        {/* ── Obsidian ────────────────────────────────── */}
        {tab === 'obsidian' && (
          <div className="settings-section">
            <div className="section-header">Vault Path</div>
            <div className="form-group">
              <label className="form-label">Obsidian Vault Folder</label>
              <div className="form-row">
                <input
                  className="form-input"
                  value={form.obsidianVaultPath || ''}
                  onChange={e => update('obsidianVaultPath', e.target.value)}
                  placeholder="e.g. E:\Everything\obsidian"
                />
                <button className="btn btn-secondary btn-sm" onClick={handleBrowse}>Browse</button>
                <button className="btn btn-secondary btn-sm" onClick={handleTestOb} disabled={testing === 'ob'}>
                  {testing === 'ob' ? '…' : 'Test'}
                </button>
              </div>
              <StatusMsg status={obStatus} />
            </div>

            <div className="divider" />

            <div className="section-header">System Prompt</div>
            <div className="form-group">
              <label className="form-label">Zeno Personality Prompt</label>
              <textarea
                className="form-input"
                value={form.systemPrompt || ''}
                onChange={e => update('systemPrompt', e.target.value)}
                rows={6}
                style={{ resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 12 }}
              />
            </div>
          </div>
        )}

        {/* ── WhatsApp (Settings only, not connection) ─ */}
        {tab === 'whatsapp-settings' && (
          <div className="settings-section">
            <div className="info-box" style={{ marginBottom: 16 }}>
              Full WhatsApp management (QR login, busy script, schedule) is available on the WhatsApp page in the navigation.
              These are supplementary settings.
            </div>
            <div className="form-group">
              <label className="toggle-row">
                <span className="form-label" style={{ margin: 0 }}>Enable WhatsApp integration</span>
                <input type="checkbox" checked={!!form.whatsappEnabled} onChange={e => update('whatsappEnabled', e.target.checked)} />
              </label>
            </div>
            <div className="form-group">
              <label className="toggle-row">
                <span className="form-label" style={{ margin: 0 }}>Auto-send busy script on new messages</span>
                <input type="checkbox" checked={!!form.whatsappAutoReply} onChange={e => update('whatsappAutoReply', e.target.checked)} />
              </label>
            </div>
          </div>
        )}

        {/* ── PC Bridge ───────────────────────────────── */}
        {tab === 'bridge' && (
          <div className="settings-section">
            <div className="section-header">PC Bridge</div>
            <div className="info-box" style={{ marginBottom: 16 }}>
              PC Bridge allows Zeno to run whitelisted actions on a remote PC over your local network.
              Disabled by default. All actions require an approval popup before running.
              Share token is configured in <code>.env</code> as <code>PC_BRIDGE_TOKEN</code>.
            </div>
            <div className="form-group">
              <label className="toggle-row">
                <span className="form-label" style={{ margin: 0 }}>Enable PC Bridge</span>
                <input type="checkbox" checked={!!form.pcBridgeEnabled} onChange={e => update('pcBridgeEnabled', e.target.checked)} />
              </label>
            </div>
            <div className="form-group">
              <label className="form-label">Bridge URL</label>
              <div className="form-row">
                <input
                  className="form-input"
                  value={form.pcBridgeUrl || ''}
                  onChange={e => update('pcBridgeUrl', e.target.value)}
                  placeholder="http://localhost:7788"
                />
                <button className="btn btn-secondary btn-sm" onClick={handleTestBridge} disabled={testing === 'bridge' || !form.pcBridgeEnabled}>
                  {testing === 'bridge' ? '…' : 'Test'}
                </button>
              </div>
              <StatusMsg status={bridgeStatus} />
            </div>
          </div>
        )}

        {/* ── System ──────────────────────────────────── */}
        {tab === 'system' && (
          <div className="settings-section">
            <div className="section-header">Developer Mode Path</div>
            <div className="form-group">
              <label className="form-label">Zeno Project Path</label>
              <div className="form-hint">
                Required for Developer Mode. Set to the root folder of the Zeno project.
              </div>
              <input
                className="form-input"
                value={form.devModeProjectPath || ''}
                onChange={e => update('devModeProjectPath', e.target.value)}
                placeholder="e.g. C:\Users\Youssef\projects\zeno"
              />
            </div>

            <div className="divider" />

            <div className="section-header">About</div>
            <div className="info-box">
              <strong>Zeno v1.2</strong><br />
              Jarvis-style personal AI assistant powered by LM Studio and optional Claude API.
              Obsidian second brain integration. WhatsApp automation. PC Bridge for remote actions.
            </div>
          </div>
        )}

      </div>

      <div className="settings-footer">
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}
