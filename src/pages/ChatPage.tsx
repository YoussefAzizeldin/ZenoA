import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '../store/appStore'
import MessageBubble from '../components/MessageBubble'

export default function ChatPage() {
  const {
    conversations,
    activeConvId,
    activeConversation,
    isThinking,
    settings,
    addMessage,
    setThinking,
    newConversation,
    switchConversation,
    closeConversation,
    pendingClaudeContextApproval,
    setPendingClaudeContextApproval,
  } = useAppStore()

  const [input, setInput] = useState('')
  const [pendingMessages, setPendingMessages] = useState<Array<{ role: string; content: string }> | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const activeConv = activeConversation()
  const messages = activeConv?.messages || []

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isThinking])

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
    }
  }, [input])

  const buildHistory = () => messages.map(m => ({ role: m.role, content: m.content }))

  const sendMessages = async (
    msgHistory: Array<{ role: string; content: string }>,
    claudeContextApproved = false
  ) => {
    setThinking(true)
    try {
      const result = await window.zeno.chat.send({
        messages: msgHistory,
        conversationId: activeConvId,
        claudeContextApproved,
      })

      if (result.needsClaudeContextPermission) {
        setPendingMessages(msgHistory)
        setPendingClaudeContextApproval(true)
        setThinking(false)
        return
      }

      if (!result.success) {
        addMessage({ role: 'assistant', content: `⚠ ${result.error}`, error: true })
      } else {
        addMessage({
          role: 'assistant',
          content: result.message || '',
          vaultContextUsed: result.vaultContextUsed,
          provider: result.provider,
        })
      }
    } catch (e) {
      addMessage({ role: 'assistant', content: `⚠ Error: ${String(e)}`, error: true })
    } finally {
      setThinking(false)
    }
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || isThinking) return
    setInput('')
    addMessage({ role: 'user', content: text })
    const history = [...buildHistory(), { role: 'user', content: text }]
    await sendMessages(history)
  }

  const handleClaudeContextAllow = async () => {
    setPendingClaudeContextApproval(false)
    if (pendingMessages) {
      await sendMessages(pendingMessages, true)
      setPendingMessages(null)
    }
  }

  const handleClaudeContextDeny = () => {
    setPendingClaudeContextApproval(false)
    addMessage({ role: 'assistant', content: 'Understood — answering without Obsidian context.' })
    setPendingMessages(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const providerLabel = settings?.activeProvider === 'claude' ? 'Claude' : 'LM Studio'
  const isClaudeActive = settings?.activeProvider === 'claude'

  return (
    <div className="chat-page">
      {/* Conversation tabs */}
      <div className="conv-tabs-bar">
        <div className="conv-tabs-scroll">
          {conversations.map(conv => (
            <div
              key={conv.id}
              className={`conv-tab ${conv.id === activeConvId ? 'active' : ''}`}
              onClick={() => switchConversation(conv.id)}
              title={conv.title}
            >
              <span className="conv-tab-title">{conv.title}</span>
              {conversations.length > 1 && (
                <button
                  className="conv-tab-close"
                  onClick={(e) => {
                    e.stopPropagation()
                    closeConversation(conv.id)
                  }}
                  title="Close tab"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          className="conv-new-btn"
          onClick={newConversation}
          title="New conversation"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="chat-messages selectable">
        {messages.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty-glyph">◈</div>
            <div className="chat-empty-title">ZENO ONLINE</div>
            <div className="chat-empty-sub">
              Connected via {providerLabel}. How can I assist you?
            </div>
            {isClaudeActive && (
              <div className="chat-empty-badge">CLAUDE MODE ACTIVE</div>
            )}
          </div>
        )}

        {messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {isThinking && (
          <div className="thinking-row">
            <div className="thinking-indicator">
              <span className="thinking-dot" />
              <span className="thinking-dot" />
              <span className="thinking-dot" />
            </div>
            <span className="thinking-label">Zeno is thinking…</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Claude context permission */}
      {pendingClaudeContextApproval && (
        <div className="claude-context-banner">
          <div className="claude-context-icon">⚠</div>
          <div className="claude-context-text">
            <strong>Obsidian context required</strong>
            <p>This request may need relevant note snippets sent to Claude. Allow this once?</p>
          </div>
          <div className="claude-context-actions">
            <button className="btn btn-primary btn-sm" onClick={handleClaudeContextAllow}>
              Allow once
            </button>
            <button className="btn btn-secondary btn-sm" onClick={handleClaudeContextDeny}>
              Deny
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="chat-input-area">
        {isClaudeActive && (
          <div className="chat-provider-badge">CLAUDE</div>
        )}
        <textarea
          ref={textareaRef}
          className="chat-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Message Zeno via ${providerLabel}…`}
          rows={1}
          disabled={isThinking || pendingClaudeContextApproval}
        />
        <button
          className="chat-send-btn"
          onClick={handleSend}
          disabled={!input.trim() || isThinking || pendingClaudeContextApproval}
          title="Send (Enter)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22,2 15,22 11,13 2,9"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
