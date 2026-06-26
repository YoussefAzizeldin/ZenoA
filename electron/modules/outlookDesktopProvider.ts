import { execFile } from 'child_process'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { promisify } from 'util'
import { ActivityLog } from './activityLog'
import { EmailMessage, EmailReadResult } from './emailTypes'

const execFileAsync = promisify(execFile)

interface OutlookPowerShellResult {
  success: boolean
  messages?: Array<{
    id?: string
    from?: string
    subject?: string
    body?: string
    receivedAt?: string
    isUnread?: boolean
    externalId?: string
  }>
  error?: string
}

interface OutlookSendResult {
  success: boolean
  error?: string
}

export class OutlookDesktopProvider {
  readonly id = 'outlook-desktop' as const

  constructor(private readonly log: ActivityLog) {}

  async status() {
    const script = '[PSCustomObject]@{ success = ([type]::GetTypeFromProgID("Outlook.Application") -ne $null) } | ConvertTo-Json -Compress'
    try {
      const { stdout } = await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
        { windowsHide: true, timeout: 10000 }
      )
      const parsed = this.parsePowerShellJson(stdout)
      if (!parsed.success) {
        return {
          provider: this.id,
          available: false,
          message: 'Outlook Desktop does not appear to be installed on this Windows profile.',
        }
      }
      return {
        provider: this.id,
        available: true,
        message: 'Outlook Desktop is installed. Inbox access will be checked when you read email.',
      }
    } catch {
      return {
        provider: this.id,
        available: false,
        message: 'Could not check Outlook Desktop availability through local PowerShell.',
      }
    }
  }

  async readRecent(limit = 10): Promise<EmailReadResult> {
    return this.read(limit, false)
  }

  async readUnread(limit = 10): Promise<EmailReadResult> {
    return this.read(limit, true)
  }

  async sendApprovedReply(message: EmailMessage, body: string): Promise<OutlookSendResult> {
    if (message.provider !== this.id || !message.externalId) {
      return { success: false, error: 'This reply can only be sent for Outlook Desktop emails with an Outlook message id.' }
    }
    if (!body.trim()) {
      return { success: false, error: 'Reply body is required.' }
    }

    const basePath = path.join(os.tmpdir(), `zeno-outlook-reply-${process.pid}-${Date.now()}`)
    const scriptPath = `${basePath}.ps1`
    const bodyPath = `${basePath}.txt`
    const outputPath = `${basePath}.json`

    try {
      await fs.writeFile(scriptPath, this.buildSendReplyScript(), 'utf-8')
      await fs.writeFile(bodyPath, body, 'utf-8')
      await execFileAsync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          scriptPath,
          '-EntryId',
          message.externalId,
          '-BodyPath',
          bodyPath,
          '-OutputPath',
          outputPath,
        ],
        { windowsHide: true, maxBuffer: 1024 * 512, timeout: 45000 }
      )

      const output = await fs.readFile(outputPath, 'utf-8').catch(() => '')
      const parsed = this.parsePowerShellJson(output) as OutlookSendResult
      if (!parsed.success) {
        const error = parsed.error || 'Outlook Desktop reply send failed.'
        this.log.log('EMAIL_PROVIDER_ERROR', error, false, undefined, undefined, message.from)
        return { success: false, error }
      }

      this.log.log('EMAIL_REPLY_SENT', `Approved Outlook reply sent: ${message.subject}`, true, undefined, undefined, message.from)
      return { success: true }
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error)
      const friendly = this.friendlyOutlookError(rawMessage)
      this.log.log('EMAIL_PROVIDER_ERROR', `Outlook reply failed: ${friendly}`, false, undefined, friendly, message.from)
      return { success: false, error: friendly }
    } finally {
      await fs.unlink(scriptPath).catch(() => undefined)
      await fs.unlink(bodyPath).catch(() => undefined)
      await fs.unlink(outputPath).catch(() => undefined)
    }
  }

  private async read(limit: number, unreadOnly: boolean): Promise<EmailReadResult> {
    const safeLimit = Math.max(1, Math.min(50, Math.floor(limit || 10)))
    const basePath = path.join(os.tmpdir(), `zeno-outlook-reader-${process.pid}-${Date.now()}`)
    const scriptPath = `${basePath}.ps1`
    const outputPath = `${basePath}.json`

    try {
      await fs.writeFile(scriptPath, this.buildReadScript(), 'utf-8')
      const { stderr } = await execFileAsync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          scriptPath,
          '-Limit',
          String(safeLimit),
          '-UnreadOnly',
          unreadOnly ? 'true' : 'false',
          '-OutputPath',
          outputPath,
        ],
        { windowsHide: true, maxBuffer: 1024 * 1024 * 3, timeout: 45000 }
      )

      const output = await fs.readFile(outputPath, 'utf-8').catch(() => '')
      const parsed = this.parsePowerShellJson(output)
      if (!parsed.success) {
        const message = parsed.error || stderr || 'Outlook Desktop reader failed.'
        this.log.log('EMAIL_PROVIDER_ERROR', message, false)
        return { success: false, provider: this.id, messages: [], error: message }
      }

      const messages: EmailMessage[] = (parsed.messages || []).map((message, index) => ({
        id: `outlook-${message.externalId || message.id || `${Date.now()}-${index}`}`,
        provider: this.id,
        from: message.from || 'Unknown sender',
        subject: message.subject || '(No subject)',
        body: message.body || '',
        receivedAt: message.receivedAt,
        isUnread: !!message.isUnread,
        externalId: message.externalId || message.id,
      }))

      this.log.log(
        'EMAIL_READ',
        `Read ${messages.length} ${unreadOnly ? 'unread' : 'recent'} Outlook email(s)`,
        true
      )
      return { success: true, provider: this.id, messages }
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error)
      const message = `Outlook Desktop is unavailable, busy, or not signed in: ${this.friendlyOutlookError(rawMessage)}`
      this.log.log('EMAIL_PROVIDER_ERROR', message, false)
      return { success: false, provider: this.id, messages: [], error: message }
    } finally {
      await fs.unlink(scriptPath).catch(() => undefined)
      await fs.unlink(outputPath).catch(() => undefined)
    }
  }

  private parsePowerShellJson(stdout: string): OutlookPowerShellResult {
    const trimmed = stdout.trim()
    const firstBrace = trimmed.indexOf('{')
    const lastBrace = trimmed.lastIndexOf('}')
    const json = firstBrace >= 0 && lastBrace >= firstBrace
      ? trimmed.slice(firstBrace, lastBrace + 1)
      : trimmed
    if (!json) return { success: false, error: 'No response from Outlook Desktop reader.' }
    return JSON.parse(json)
  }

  private friendlyOutlookError(message: string): string {
    if (message.includes('0x80010001') || message.includes('RPC_E_CALL_REJECTED') || message.includes('Call was rejected by callee')) {
      return 'Outlook is busy and rejected the local COM call. Bring Outlook to the foreground, wait for it to finish loading/syncing, close any modal dialogs, then try again.'
    }
    return message
  }

  private buildReadScript(): string {
    return `
param(
  [int]$Limit = 10,
  [string]$UnreadOnly = "false",
  [string]$OutputPath
)

$ErrorActionPreference = "Stop"

function Write-ZenoJson($Payload) {
  $json = $Payload | ConvertTo-Json -Depth 6 -Compress
  if ($OutputPath) {
    [System.IO.File]::WriteAllText($OutputPath, $json, [System.Text.UTF8Encoding]::new($false))
  } else {
    Write-Output $json
  }
}

function Invoke-WithRetry([scriptblock]$Action) {
  $lastError = $null
  for ($attempt = 1; $attempt -le 4; $attempt++) {
    try {
      return & $Action
    } catch {
      $lastError = $_
      $message = $_.Exception.Message
      if ($message -notmatch "0x80010001|RPC_E_CALL_REJECTED|Call was rejected by callee") {
        throw
      }
      Start-Sleep -Milliseconds (350 * $attempt)
    }
  }
  throw $lastError
}

try {
  $unreadOnlyFlag = $UnreadOnly -eq "true"
  $outlook = Invoke-WithRetry { New-Object -ComObject Outlook.Application }
  $namespace = Invoke-WithRetry { $outlook.GetNamespace("MAPI") }
  $inbox = Invoke-WithRetry { $namespace.GetDefaultFolder(6) }
  $items = Invoke-WithRetry { $inbox.Items }
  if ($unreadOnlyFlag) {
    $items = Invoke-WithRetry { $items.Restrict("[UnRead] = true") }
  }
  $sortSucceeded = $false
  try {
    Invoke-WithRetry { $items.Sort("[ReceivedTime]", $true) | Out-Null }
    $sortSucceeded = $true
  } catch {
    $sortSucceeded = $false
  }
  $messages = New-Object System.Collections.Generic.List[object]

  function Add-ZenoMessage($item) {
    try {
      if ($null -eq $item -or $item.MessageClass -notlike "IPM.Note*") { return }
      $body = [string]$item.Body
      if ($body.Length -gt 6000) { $body = $body.Substring(0, 6000) }
      $received = $null
      if ($item.ReceivedTime) { $received = ([DateTime]$item.ReceivedTime).ToString("o") }
      $sender = [string]$item.SenderName
      $senderEmail = [string]$item.SenderEmailAddress
      if ($senderEmail -and $sender -and $senderEmail -ne $sender) {
        $sender = "$sender <$senderEmail>"
      } elseif ($senderEmail) {
        $sender = $senderEmail
      }
      $messages.Add([PSCustomObject]@{
        id = [string]$item.EntryID
        externalId = [string]$item.EntryID
        from = $sender
        subject = [string]$item.Subject
        body = $body
        receivedAt = $received
        isUnread = [bool]$item.UnRead
      })
    } catch {}
  }

  if ($sortSucceeded) {
    foreach ($item in $items) {
      if ($messages.Count -ge $Limit) { break }
      Add-ZenoMessage $item
    }
  } else {
    $scanLimit = [Math]::Max($Limit * 20, 200)
    try {
      $count = [int]$items.Count
      $start = [Math]::Max(1, $count - $scanLimit + 1)
      for ($i = $count; $i -ge $start; $i--) {
        Add-ZenoMessage (Invoke-WithRetry { $items.Item($i) })
      }
    } catch {
      $scanned = 0
      foreach ($item in $items) {
        if ($scanned -ge $scanLimit) { break }
        Add-ZenoMessage $item
        $scanned++
      }
    }
  }

  $sortedMessages = @($messages | Sort-Object @{ Expression = { $_.receivedAt }; Descending = $true } | Select-Object -First $Limit)
  Write-ZenoJson ([PSCustomObject]@{ success = $true; messages = $sortedMessages })
} catch {
  Write-ZenoJson ([PSCustomObject]@{ success = $false; error = $_.Exception.Message })
}
`
  }

  private buildSendReplyScript(): string {
    return `
param(
  [string]$EntryId,
  [string]$BodyPath,
  [string]$OutputPath
)

$ErrorActionPreference = "Stop"

function Write-ZenoJson($Payload) {
  $json = $Payload | ConvertTo-Json -Depth 4 -Compress
  [System.IO.File]::WriteAllText($OutputPath, $json, [System.Text.UTF8Encoding]::new($false))
}

function Invoke-WithRetry([scriptblock]$Action) {
  $lastError = $null
  for ($attempt = 1; $attempt -le 4; $attempt++) {
    try {
      return & $Action
    } catch {
      $lastError = $_
      $message = $_.Exception.Message
      if ($message -notmatch "0x80010001|RPC_E_CALL_REJECTED|Call was rejected by callee") {
        throw
      }
      Start-Sleep -Milliseconds (350 * $attempt)
    }
  }
  throw $lastError
}

try {
  if (-not $EntryId) { throw "Missing Outlook EntryID." }
  if (-not (Test-Path -LiteralPath $BodyPath)) { throw "Missing approved reply body." }

  $replyBody = [System.IO.File]::ReadAllText($BodyPath, [System.Text.Encoding]::UTF8)
  $outlook = Invoke-WithRetry { New-Object -ComObject Outlook.Application }
  $namespace = Invoke-WithRetry { $outlook.GetNamespace("MAPI") }
  $item = Invoke-WithRetry { $namespace.GetItemFromID($EntryId) }
  if ($null -eq $item) { throw "Original Outlook email was not found." }

  $reply = Invoke-WithRetry { $item.Reply() }
  $reply.Body = $replyBody + "\\r\\n\\r\\n" + $reply.Body
  Invoke-WithRetry { $reply.Send() | Out-Null }
  Write-ZenoJson ([PSCustomObject]@{ success = $true })
} catch {
  Write-ZenoJson ([PSCustomObject]@{ success = $false; error = $_.Exception.Message })
}
`
  }
}
