'use client'
import { useEffect, useRef, useState } from 'react'
import { admin } from '@/lib/api'
import type { ViewerCount } from '@/types'
import clsx from 'clsx'

interface AdminMsg {
  id:          string
  senderName:  string
  senderAvatar?: string | null
  content:     string
  messageType: string
  highlighted?: boolean
  timestamp:   string
  sessionId?:  string
  ipAddress?:  string
  shadowBanned?: boolean
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
function resolveAvatar(u?: string | null): string | null {
  if (!u) return null
  return u.startsWith('http') ? u : `${API_URL}${u}`
}
const AVATAR_BGS = [
  'bg-sky-500', 'bg-emerald-500', 'bg-violet-500',
  'bg-rose-500', 'bg-amber-500', 'bg-cyan-600',
  'bg-lime-500', 'bg-pink-500',
]
function avatarBg(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return AVATAR_BGS[Math.abs(h) % AVATAR_BGS.length]
}

interface Props {
  liveId:      string
  messages:    AdminMsg[]
  viewerCount: ViewerCount
  onDelete:    (id: string) => void
}

const NAME_COLOURS = ['text-sky-400','text-emerald-400','text-violet-400','text-rose-400','text-amber-400','text-cyan-400','text-lime-400','text-pink-400']
function nameColour(name: string) {
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return NAME_COLOURS[Math.abs(h) % NAME_COLOURS.length]
}

export default function AdminChatMonitor({ liveId, messages, viewerCount, onDelete }: Props) {
  const [input, setInput]         = useState('')
  const [sending, setSending]     = useState(false)
  const [actionId, setActionId]   = useState<string | null>(null)  // msg with open actions
  const bottomRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, autoScroll])

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 60)
  }

  async function sendAdmin(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || sending) return
    setSending(true)
    try {
      await admin.sendChat(liveId, { content: input.trim(), type: 'admin' })
      setInput('')
    } catch (err: any) { alert(err.message) }
    finally { setSending(false) }
  }

  async function doDelete(msgId: string) {
    try { await admin.deleteMessage(liveId, msgId); onDelete(msgId) }
    catch (err: any) { alert(err.message) }
    setActionId(null)
  }

  async function doKick(sessionId: string) {
    if (!confirm(`Remover e bloquear este usuário da live?`)) return
    try { await admin.kickViewer(liveId, sessionId) }
    catch (err: any) { alert(err.message) }
    setActionId(null)
  }

  async function doShadow(sessionId: string) {
    try { await admin.shadowBanViewer(liveId, sessionId) }
    catch (err: any) { alert(err.message) }
    setActionId(null)
  }

  async function doShadowHide(msgId: string) {
    try { await admin.shadowHideMessage(liveId, msgId) }
    catch (err: any) { alert(err.message) }
    setActionId(null)
  }

  return (
    <div className="flex flex-col flex-1 bg-surface border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between shrink-0">
        <span className="font-semibold text-sm">Chat ao vivo</span>
        <div className="flex items-center gap-1.5 text-muted text-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-success pulse-live inline-block" />
          <span className="font-semibold text-white">{viewerCount.total.toLocaleString('pt-BR')}</span>
          <span>assistindo</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1" onScroll={handleScroll}>
        {messages.length === 0 && (
          <p className="text-center text-muted text-xs py-6">Nenhuma mensagem ainda.</p>
        )}
        {messages.map((msg) => {
          if (msg.messageType === 'system') {
            return (
              <div key={msg.id} className="text-center py-0.5">
                <span className="text-xs text-accent/70 bg-accent/10 px-2 py-0.5 rounded-full">{msg.content}</span>
              </div>
            )
          }

          const isAdmin  = msg.messageType === 'admin' || msg.highlighted
          const isFake   = msg.messageType === 'fake' || msg.messageType === 'flash'
          const nameClass = isAdmin ? 'text-orange-400 font-bold' : nameColour(msg.senderName)
          const isOpen   = actionId === msg.id
          const avatar   = resolveAvatar(msg.senderAvatar)

          return (
            <div
              key={msg.id}
              className={clsx(
                'group relative text-sm leading-relaxed break-words rounded-lg px-2 py-1 transition-colors',
                msg.shadowBanned ? 'opacity-50 line-through' : '',
                isOpen ? 'bg-surface2' : 'hover:bg-surface2/60',
                msg.highlighted && 'bg-accent/10 border border-accent/30',
              )}
            >
              <div className="flex items-start gap-1.5">
                {/* Avatar */}
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatar}
                    alt={msg.senderName}
                    className="w-5 h-5 rounded-full object-cover shrink-0 mt-0.5 ring-1 ring-white/10"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                  />
                ) : (
                  <div className={clsx(
                    'w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white uppercase shrink-0 mt-0.5',
                    avatarBg(msg.senderName)
                  )}>
                    {msg.senderName?.[0] ?? '?'}
                  </div>
                )}

                {/* Type indicator */}
                {isFake && <span className="text-xs text-muted/60 shrink-0 mt-0.5" title="Bot">🤖</span>}
                {isAdmin && <span className="text-xs shrink-0 mt-0.5" title="Admin">👑</span>}

                <div className="flex-1 min-w-0">
                  <span className={clsx('font-semibold text-xs mr-1', nameClass)}>
                    {msg.senderName}{isAdmin ? ' ✦' : ''}:
                  </span>
                  <span className="text-white/90 text-xs">{msg.content}</span>
                </div>

                {/* Actions toggle — only for real messages */}
                {msg.messageType === 'real' && (
                  <button
                    onClick={() => setActionId(isOpen ? null : msg.id)}
                    className={clsx(
                      'shrink-0 text-xs px-1.5 py-0.5 rounded transition-colors',
                      isOpen ? 'text-white bg-surface' : 'text-muted/0 group-hover:text-muted hover:text-white'
                    )}
                    title="Ações"
                  >
                    ···
                  </button>
                )}

                {/* Quick delete for fake/admin */}
                {(isFake || isAdmin) && (
                  <button
                    onClick={() => doDelete(msg.id)}
                    className="shrink-0 text-muted/0 group-hover:text-muted hover:text-danger text-xs px-1 transition-colors"
                    title="Apagar"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Action panel for real messages */}
              {isOpen && msg.messageType === 'real' && (
                <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-border/50">
                  <button
                    onClick={() => doDelete(msg.id)}
                    className="flex items-center gap-1 text-xs bg-surface border border-border hover:border-danger/50 hover:text-danger text-muted px-2 py-1 rounded-lg transition-colors"
                  >
                    🗑 Apagar msg
                  </button>
                  {!msg.shadowBanned && (
                    <button
                      onClick={() => doShadowHide(msg.id)}
                      className="flex items-center gap-1 text-xs bg-surface border border-border hover:border-warning/50 hover:text-warning text-muted px-2 py-1 rounded-lg transition-colors"
                      title="Esconde só esta mensagem dos outros viewers — o autor continua vendo a dele"
                    >
                      🙈 Esconder dos outros
                    </button>
                  )}
                  {msg.sessionId && (
                    <>
                      <button
                        onClick={() => doShadow(msg.sessionId!)}
                        className="flex items-center gap-1 text-xs bg-surface border border-border hover:border-warning/50 hover:text-warning text-muted px-2 py-1 rounded-lg transition-colors"
                        title="Shadow ban do usuário: futuras mensagens dele só ele verá"
                      >
                        👻 Shadow ban
                      </button>
                      <button
                        onClick={() => doKick(msg.sessionId!)}
                        className="flex items-center gap-1 text-xs bg-surface border border-border hover:border-danger/50 hover:text-danger text-muted px-2 py-1 rounded-lg transition-colors"
                      >
                        🚫 Banir e remover
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Admin input */}
      <form onSubmit={sendAdmin} className="px-3 py-2.5 border-t border-border shrink-0">
        <p className="text-xs text-orange-400 font-semibold mb-1.5">✦ Comentar como Admin</p>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Mensagem destacada para todos..."
            maxLength={500}
            className="flex-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-muted focus:outline-none focus:border-orange-400/60 transition-colors"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="bg-orange-500 hover:bg-orange-500/90 disabled:opacity-40 text-white text-sm px-4 rounded-lg transition-colors font-semibold shrink-0"
          >
            ➤
          </button>
        </div>
      </form>
    </div>
  )
}
