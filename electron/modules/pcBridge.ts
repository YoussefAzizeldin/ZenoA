/**
 * PC Bridge — PLACEHOLDER / STUB
 *
 * TODO (Future Phase): Implement a local HTTP bridge server that allows
 * Zeno to call safe, whitelisted actions on the host PC over the network.
 *
 * Intended use case:
 * - Zeno runs on laptop
 * - PC runs LM Studio server
 * - Bridge runs on PC, allows Zeno to: check LM Studio status, open folders,
 *   run npm scripts, check git status
 *
 * Architecture plan:
 * 1. Small Express/HTTP server on PC (separate process or Electron helper)
 * 2. Whitelisted endpoints only — no arbitrary shell execution
 * 3. Shared secret token in .env for auth
 * 4. Tailscale or private network only (never public internet)
 * 5. Zeno main app pings bridge /health endpoint on startup
 * 6. GUI shows Bridge: connected / disconnected in status bar
 *
 * Allowed bridge actions (planned):
 * - GET  /health                 → ping
 * - GET  /status                 → LM Studio running, disk free, etc.
 * - POST /action/open-zeno-folder
 * - POST /action/npm-install
 * - POST /action/npm-dev
 * - POST /action/git-status
 *
 * FORBIDDEN (will never be added):
 * - Arbitrary shell commands
 * - File deletion
 * - Registry edits
 * - Mass operations
 * - Public exposure
 *
 * Current status: STUB ONLY — no HTTP server is started.
 * Settings UI shows the enable toggle and URL field but bridge is non-functional.
 */

import axios from 'axios'
import { ActivityLog } from './activityLog'

export type BridgeStatus = 'disabled' | 'connected' | 'disconnected' | 'checking'

export class PCBridgeClient {
  private url: string
  private token: string | null
  private log: ActivityLog
  private status: BridgeStatus = 'disabled'
  private enabled: boolean

  constructor(url: string, enabled: boolean, log: ActivityLog) {
    this.url = url
    this.enabled = enabled
    this.log = log
    this.token = process.env.PC_BRIDGE_TOKEN || null
  }

  getStatus(): BridgeStatus { return this.status }

  async checkHealth(): Promise<{ connected: boolean; error?: string }> {
    if (!this.enabled) {
      this.status = 'disabled'
      return { connected: false, error: 'PC Bridge is disabled in settings' }
    }

    this.status = 'checking'
    this.log.log('BRIDGE_STATUS', `Checking PC Bridge at ${this.url}`, true)

    try {
      const res = await axios.get(`${this.url}/health`, {
        timeout: 3000,
        headers: this.token ? { 'x-bridge-token': this.token } : {},
      })
      if (res.status === 200) {
        this.status = 'connected'
        this.log.log('BRIDGE_STATUS', 'PC Bridge connected', true)
        return { connected: true }
      }
      throw new Error(`HTTP ${res.status}`)
    } catch (err) {
      this.status = 'disconnected'
      const msg = err instanceof Error ? err.message : String(err)
      this.log.log('BRIDGE_STATUS', `PC Bridge unreachable: ${msg}`, false)
      return { connected: false, error: msg }
    }
  }

  // TODO: implement individual action endpoints when bridge server is built
  // async runAction(action: string): Promise<{ success: boolean; output?: string; error?: string }> { ... }

  updateConfig(url: string, enabled: boolean) {
    this.url = url
    this.enabled = enabled
    this.status = enabled ? 'disconnected' : 'disabled'
  }
}
