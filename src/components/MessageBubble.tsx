import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Message } from '../store/appStore'
import zenoLogo from '../assets/zeno-logo.png'

interface Props {
  message: Message
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user'

  return (
    <div className={`message-row ${message.role}`}>
      <div className={`message-avatar ${message.role}`}>
        {isUser ? 'YOU' : <img className="message-avatar-logo" src={zenoLogo} alt="" aria-hidden="true" />}
      </div>
      <div>
        <div className={`message-bubble ${message.role} selectable ${message.error ? 'text-error' : ''}`}>
          {isUser ? (
            <span style={{ whiteSpace: 'pre-wrap' }}>{message.content}</span>
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          )}
        </div>
        <div className="message-meta">
          <span>{formatTime(message.timestamp)}</span>
          {message.vaultContextUsed && (
            <span className="message-vault-badge">⬡ VAULT</span>
          )}
        </div>
      </div>
    </div>
  )
}

export function ThinkingBubble() {
  return (
    <div className="message-row assistant">
      <div className="message-avatar assistant">
        <img className="message-avatar-logo" src={zenoLogo} alt="" aria-hidden="true" />
      </div>
      <div className="thinking-bubble">
        <div className="thinking-dots">
          <div className="thinking-dot" />
          <div className="thinking-dot" />
          <div className="thinking-dot" />
        </div>
        <span>Processing</span>
      </div>
    </div>
  )
}
