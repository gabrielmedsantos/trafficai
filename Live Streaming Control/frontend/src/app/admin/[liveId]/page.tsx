'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { lives, admin, leads as leadsApi } from '@/lib/api'
import { useAuthStore } from '@/store/live.store'
import { createAdminSocket } from '@/lib/ws'
import type { Live, Persona, ViewerCount, ChatMessage, WsEvent } from '@/types'
import clsx from 'clsx'

import HostAvatarBadge   from '@/components/HostAvatarBadge'
import ViewerControl     from '@/components/admin/ViewerControl'
import ChatControl       from '@/components/admin/ChatControl'
import QueueControl      from '@/components/admin/QueueControl'
import CTAControl        from '@/components/admin/CTAControl'
import ReactionControl   from '@/components/admin/ReactionControl'
import ModerationControl    from '@/components/admin/ModerationControl'
import ParticipantControl  from '@/components/admin/ParticipantControl'
import FakeVideoControl    from '@/components/admin/FakeVideoControl'
import ChatBox             from '@/components/chat/ChatBox'
import AdminChatMonitor    from '@/components/admin/AdminChatMonitor'
import UTMGenerator        from '@/components/admin/UTMGenerator'
import ConversionFunnel    from '@/components/leads/ConversionFunnel'
import LeadTimelineModal   from '@/components/leads/LeadTimelineModal'
import ScoreBadge          from '@/components/leads/ScoreBadge'

type Tab = 'overview' | 'control' | 'chat' | 'stream' | 'leads'

const NAV: { id: Tab; icon: string; label: string }[] = [
  { id: 'overview', icon: '📊', label: 'Visão Geral'  },
  { id: 'control',  icon: '🎛',  label: 'Controle'    },
  { id: 'chat',     icon: '💬',  label: 'Chat'         },
  { id: 'stream',   icon: '📡',  label: 'Stream / OBS' },
  { id: 'leads',    icon: '👥',  label: 'Leads'        },
]

export default function AdminPage() {
  const { liveId } = useParams<{ liveId: string }>()
  const router     = useRouter()
  const token      = useAuthStore((s) => s.token)

  const [live, setLive]               = useState<Live | null>(null)
  const [streamInfo, setStreamInfo]   = useState<any>(null)
  const [personas, setPersonas]       = useState<Persona[]>([])

  // Update browser tab title with live name
  useEffect(() => {
    if (!live?.title) return
    // Use a microtask to ensure we run after Next.js hydration
    const t = setTimeout(() => { document.title = `${live.title} — Admin` }, 0)
    return () => { clearTimeout(t); document.title = 'LiveStack' }
  }, [live?.title])

  function handlePersonaUpdated(updated: Persona) {
    setPersonas(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p)
      .sort((a, b) => Number(b.is_favorite) - Number(a.is_favorite) || a.name.localeCompare(b.name)))
  }
  const [viewerCount, setViewerCount] = useState<ViewerCount>({ real: 0, fake: 0, total: 0 })
  const [messages, setMessages]       = useState<(ChatMessage & { sessionId?: string; ipAddress?: string; shadowBanned?: boolean })[]>([])
  const [connected, setConnected]     = useState(false)
  const [tab, setTab]                 = useState<Tab>('overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [utmOpen, setUtmOpen]         = useState(true)
  const [leadsData, setLeadsData]     = useState<any[]>([])
  const [leadsFilter, setLeadsFilter] = useState<'all' | 'favorites' | 'blocked' | 'active'>('all')
  const [stats, setStats]             = useState<any>(null)
  const [startingLive, setStartingLive] = useState(false)
  const [openLeadId, setOpenLeadId]   = useState<string | null>(null)
  const wsRef = useRef<ReturnType<typeof createAdminSocket> | null>(null)

  // Backstage (private admin chat with presenter)
  const [bsMessages, setBsMessages] = useState<{ id: string; senderName: string; content: string; timestamp: string }[]>([])
  const [bsInput, setBsInput]       = useState('')
  const [bsOpen, setBsOpen]         = useState(false)
  const [bsUnread, setBsUnread]     = useState(0)
  const bsBottomRef = useRef<HTMLDivElement>(null)

  // Guard: warn before leaving while live is active
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (live?.status === 'live') {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [live?.status])

  useEffect(() => {
    if (!token) { router.push('/login'); return }

    Promise.all([
      lives.get(liveId),
      lives.streamInfo(liveId),
      admin.listPersonas(),
      lives.analytics(liveId),
      lives.leads(liveId),
      admin.listMessages(liveId, { limit: 1000 }).catch(() => []),
    ]).then(([l, si, p, a, ld, hist]) => {
      setLive(l); setStreamInfo(si); setPersonas(p); setStats(a); setLeadsData(ld)
      // Hydrate chat with persisted history; WS will append new ones (deduped below)
      // Note: histórico já vem com camelCase (senderAvatar), mas mensagens ao vivo
      // via WS admin também trazem event.data.senderAvatar. Ambos passam intactos.
      if (Array.isArray(hist) && hist.length) {
        setMessages(hist as any)
      }
    }).catch(() => router.push('/dashboard'))

    const ws = createAdminSocket(liveId, token)
    wsRef.current = ws
    ws.onStatus(setConnected)
    ws.on((event: WsEvent) => {
      switch (event.type) {
        case 'admin_init':   setViewerCount(event.data.viewerCount); break
        case 'viewer_count': setViewerCount(event.data); break
        case 'chat_message_admin':
          setMessages((prev) => {
            // Dedupe: history endpoint may already include this message
            // (e.g. user opens admin while live is running and history fetched
            // milliseconds before the WS event arrived).
            if (prev.some(m => m.id === event.data.id)) return prev
            const next = [...prev, {
              id: event.data.id, senderName: event.data.senderName,
              senderAvatar: (event.data as any).senderAvatar ?? null,
              content: event.data.content, messageType: event.data.messageType,
              highlighted: event.data.highlighted, timestamp: event.data.timestamp,
              sessionId: event.data.sessionId, ipAddress: event.data.ipAddress,
              shadowBanned: event.data.shadowBanned,
            }]
            // Keep only the last 1000 in memory (history endpoint also caps at 1000)
            return next.length > 1000 ? next.slice(-1000) : next
          })
          break
        case 'message_deleted':
          setMessages((prev) => prev.filter(m => m.id !== event.data.messageId))
          break
        case 'message_shadow_hidden':
          // Mark as shadow-banned in the admin view (line-through styling)
          // without removing it — moderator should still be able to review.
          setMessages((prev) => prev.map(m =>
            m.id === event.data.messageId ? { ...m, shadowBanned: true } : m
          ))
          break
        case 'stream_status':
          setLive((l) => l ? { ...l, status: event.data.status } : l)
          break
        case 'new_lead':
          setLeadsData((prev) => {
            // upsert: update if same id exists (re-entry), otherwise prepend
            const exists = prev.some(l => l.id === event.data.id)
            if (exists) return prev.map(l => l.id === event.data.id ? { ...l, ...event.data } : l)
            return [event.data, ...prev]
          })
          break
        case 'admin_chat':
          setBsMessages(prev => [...prev.slice(-199), event.data as any])
          setBsOpen(open => { if (!open) setBsUnread(n => n + 1); return open })
          break
      }
    })
    ws.connect()
    return () => ws.disconnect()
  }, [liveId, token])

  // Auto-scroll backstage
  useEffect(() => {
    if (bsOpen) bsBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [bsMessages, bsOpen])

  function sendBackstage(e: React.FormEvent) {
    e.preventDefault()
    const text = bsInput.trim()
    if (!text) return
    wsRef.current?.send({ type: 'admin_chat', data: { content: text, senderName: 'Admin' } })
    setBsInput('')
  }

  async function endLive() {
    if (!confirm('Encerrar esta live?')) return
    try { await lives.end(liveId); setLive((l) => l ? { ...l, status: 'ended' } : l) }
    catch (err: any) { alert(err.message) }
  }

  if (!live) return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const isLive   = live.status === 'live'
  const isEnded  = live.status === 'ended'

  return (
    <div className="fixed inset-0 bg-bg flex flex-col overflow-hidden">

      {/* ── Top Header ─────────────────────────────────────────────── */}
      <header className="bg-surface border-b border-border px-5 py-3.5 flex items-center gap-3 shrink-0 z-10">
        <button onClick={() => setSidebarOpen(v => !v)} className="lg:hidden text-muted hover:text-white p-1 shrink-0">
          <span className="text-lg leading-none">☰</span>
        </button>
        <button
          onClick={() => {
            if (live?.status === 'live') {
              if (!confirm('A live está AO VIVO. Sair agora pode derrubar a transmissão para os espectadores.\n\nTem certeza que deseja sair?')) return
            }
            router.push('/dashboard')
          }}
          className="text-muted hover:text-white transition-colors text-lg leading-none shrink-0"
          title="Dashboard"
        >←</button>

        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-sm truncate">{live.title}</h1>
        </div>

        {/* Status badge */}
        {isLive && (
          <div className="flex items-center gap-1.5 bg-success/10 border border-success/20 text-success text-xs font-bold px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-success pulse-live" />
            AO VIVO
          </div>
        )}
        {live.status === 'waiting' && (
          <span className="text-xs font-semibold text-warning border border-warning/30 bg-warning/10 px-2.5 py-1 rounded-full">
            AGUARDANDO
          </span>
        )}
        {isEnded && (
          <span className="text-xs text-muted border border-border px-2.5 py-1 rounded-full">ENCERRADA</span>
        )}

        {/* WS status */}
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-success' : 'bg-muted'}`} />
          {connected ? 'Online' : 'Reconectando'}
        </div>

        <Link href={`/live/${live?.short_id ?? liveId}`} target="_blank"
          className="hidden sm:block text-xs bg-surface2 hover:bg-border text-muted hover:text-white px-3 py-1.5 rounded-lg transition-colors">
          Ver live ↗
        </Link>

        <Link href={`/host/${liveId}`} target="_blank"
          className="hidden sm:block text-xs bg-accent/20 hover:bg-accent/30 text-accent px-3 py-1.5 rounded-lg transition-colors font-medium">
          🎙 Apresentador ↗
        </Link>

        {!isEnded && (
          <button onClick={endLive}
            className="text-xs bg-danger/20 hover:bg-danger/30 text-danger px-3 py-1.5 rounded-lg transition-colors font-medium">
            ■ Encerrar
          </button>
        )}

        <HostAvatarBadge size="sm" />
      </header>

      {/* ── Body: left sidebar + content + right UTM sidebar ───────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Mobile overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        {/* ── LEFT SIDEBAR ──────────────────────────────────────────── */}
        <aside className={clsx(
          'w-52 bg-surface border-r border-border flex flex-col shrink-0 z-50',
          'fixed lg:static inset-y-0 left-0 transition-transform duration-300',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}>

          {/* Live KPIs */}
          <div className="p-3 border-b border-border space-y-2">
            <div className="grid grid-cols-2 gap-1.5">
              <MiniStat label="Ao vivo" value={viewerCount.real}  colour="text-success" />
              <MiniStat label="Simulados" value={viewerCount.fake}   colour="text-accent"  />
              <MiniStat label="Total"    value={viewerCount.total}  colour="text-white"   />
              <MiniStat label="Leads"    value={stats?.leads ?? 0} colour="text-warning" />
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 py-2 space-y-0.5 px-2 overflow-y-auto">
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => { setTab(n.id); setSidebarOpen(false) }}
                className={clsx(
                  'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left',
                  tab === n.id
                    ? 'bg-accent text-white'
                    : 'text-muted hover:text-white hover:bg-surface2'
                )}
              >
                <span>{n.icon}</span>
                <span>{n.label}</span>
                {n.id === 'leads' && leadsData.length > 0 && (
                  <span className="ml-auto text-xs bg-white/20 px-1.5 py-0.5 rounded-full">
                    {leadsData.length}
                  </span>
                )}
                {n.id === 'chat' && messages.length > 0 && (
                  <span className="ml-auto text-xs bg-white/20 px-1.5 py-0.5 rounded-full">
                    {messages.length}
                  </span>
                )}
                {n.id === 'stream' && isLive && tab !== 'stream' && (
                  <span className="ml-auto flex items-center gap-1 text-xs text-red-400 font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 pulse-live inline-block" />
                    live
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* Stats footer */}
          {stats && (
            <div className="p-3 border-t border-border space-y-1.5">
              <p className="text-xs text-muted font-semibold uppercase tracking-wide mb-2">Esta live</p>
              <FooterStat label="Entradas"  value={stats.viewers?.total_joins ?? 0} />
              <FooterStat label="Msgs reais" value={stats.messages?.real_messages ?? 0} />
              <FooterStat label="Cliques CTA" value={stats.cta?.clicks ?? 0} />
            </div>
          )}
        </aside>

        {/* ── MAIN CONTENT ─────────────────────────────────────────── */}
        <main className="flex-1 overflow-hidden flex flex-col">

          {/* ── VISÃO GERAL ───────────────────────────────────────── */}
          {tab === 'overview' && (
            <div className="p-5 flex flex-col h-[calc(100vh-112px)] gap-0 overflow-hidden">
              {/* KPI row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 shrink-0 mb-1">
                <KpiCard icon="👁"  label="Espectadores"  value={viewerCount.total.toLocaleString('pt-BR')} sub={`${viewerCount.real} ao vivo · ${viewerCount.fake} simulados`} />
                <KpiCard icon="👤" label="Pessoas Reais" value={stats?.viewers?.real_unique ?? 0} sub="espectadores únicos" accent="text-green-400" />
                <KpiCard icon="👥" label="Leads"          value={stats?.leads ?? 0} sub="capturados nesta live" accent="text-warning" />
                <KpiCard icon="💬" label="Msgs Reais"     value={stats?.messages?.real_messages ?? 0} sub={`${stats?.messages?.fake_messages ?? 0} fake · ${stats?.messages?.admin_messages ?? 0} admin`} />
                <KpiCard icon="🎯" label="CTA"
                  value={stats?.cta?.triggered === '1' || parseInt(stats?.cta?.triggered ?? '0') > 0 ? 'Disparado' : 'Não disparado'}
                  sub={`${stats?.cta?.clicks ?? 0} clique(s)`}
                  accent={parseInt(stats?.cta?.triggered ?? '0') > 0 ? 'text-success' : 'text-muted'}
                />
              </div>

              {/* Chat ao vivo + Controle STACKED */}
              <div className="flex-1 min-h-0 flex flex-col gap-0 overflow-hidden">
                {/* Chat */}
                <div className="flex-1 min-h-0 overflow-hidden">
                  <AdminChatMonitor
                    liveId={liveId}
                    messages={messages}
                    viewerCount={viewerCount}
                    onDelete={(id) => setMessages(prev => prev.filter(m => m.id !== id))}
                  />
                </div>

                {/* Controle de Chat + Queue */}
                <div className="h-40 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-1 overflow-hidden">
                  <div className="overflow-y-auto">
                    <ChatControl liveId={liveId} personas={personas} onPersonaUpdated={handlePersonaUpdated} />
                  </div>
                  <div className="overflow-y-auto">
                    <QueueControl liveId={liveId} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── CONTROLE ─────────────────────────────────────────── */}
          {tab === 'control' && (
            <div className="p-5">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Left: big controls */}
                <div className="lg:col-span-2 space-y-4">
                  <ViewerControl
                    liveId={liveId}
                    viewerCount={viewerCount}
                    initial={{ min: live.fake_viewers_min, max: live.fake_viewers_max, interval: live.fake_viewers_interval }}
                  />
                  <ChatControl liveId={liveId} personas={personas} onPersonaUpdated={handlePersonaUpdated} />
                  <QueueControl liveId={liveId} />
                </div>
                {/* Right: secondary */}
                <div className="space-y-4">
                  <ParticipantControl liveId={liveId} />
                  <FakeVideoControl liveId={liveId} token={token ?? ''} />
                  <CTAControl liveId={liveId} />
                  <ReactionControl liveId={liveId} />
                  <ModerationControl />
                </div>
              </div>
            </div>
          )}

          {/* ── CHAT MONITOR ─────────────────────────────────────── */}
          {tab === 'chat' && (
            <div className="p-4 lg:p-5" style={{ height: 'calc(100vh - 112px)' }}>
              <AdminChatMonitor
                liveId={liveId}
                messages={messages}
                viewerCount={viewerCount}
                onDelete={(id) => setMessages(prev => prev.filter(m => m.id !== id))}
              />
            </div>
          )}

          {/* ── STREAM ───────────────────────────────────────────── */}
          {tab === 'stream' && (
            <div className="p-5 space-y-5 max-w-2xl">

              {/* Status + start live */}
              <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-sm">Status da live</h2>
                  {isLive && (
                    <span className="flex items-center gap-1.5 text-xs font-bold text-success">
                      <span className="w-1.5 h-1.5 rounded-full bg-success pulse-live inline-block" /> AO VIVO
                    </span>
                  )}
                </div>
                {live.status === 'waiting' && (
                  <button
                    onClick={async () => {
                      setStartingLive(true)
                      try { await lives.start(liveId); setLive(l => l ? { ...l, status: 'live' } : l) }
                      catch (e: any) { alert('Erro ao iniciar: ' + e.message) }
                      finally { setStartingLive(false) }
                    }}
                    disabled={startingLive}
                    className="w-full bg-danger hover:bg-danger/90 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
                  >
                    <span className="w-2 h-2 rounded-full bg-white inline-block" />
                    {startingLive ? 'Iniciando...' : 'Iniciar live'}
                  </button>
                )}
                {isLive && (
                  <p className="text-sm text-muted text-center">
                    Live em andamento. Para encerrar, use o botão <span className="text-danger font-medium">■ Encerrar</span> no topo.
                  </p>
                )}
                {isEnded && (
                  <p className="text-sm text-muted text-center">Live encerrada.</p>
                )}
              </div>

              {/* Mode selector */}
              <div className="bg-surface border border-border rounded-xl p-5">
                <h2 className="font-semibold text-sm mb-4">Modo de transmissão</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <ModeCard
                    active={live.mode === 'obs'}
                    icon="🎥"
                    title="OBS / Software externo"
                    desc="RTMP → HLS. Delay de ~5s. Recomendado para produções."
                    onClick={async () => {
                      if (live.mode !== 'obs') {
                        await lives.update(liveId, { mode: 'obs' })
                        setLive(l => l ? { ...l, mode: 'obs' } : l)
                      }
                    }}
                  />
                  <ModeCard
                    active={live.mode === 'livekit'}
                    icon="⚡"
                    title="Navegador (WebRTC)"
                    desc="Câmera + tela direto do browser. Delay < 1s."
                    onClick={async () => {
                      if (live.mode !== 'livekit') {
                        await lives.update(liveId, { mode: 'livekit' })
                        setLive(l => l ? { ...l, mode: 'livekit' } : l)
                      }
                    }}
                  />
                  <ModeCard
                    active={live.mode === 'hybrid'}
                    icon="🔀"
                    title="Híbrido"
                    desc="Vídeo via OBS + participantes via LiveKit. Melhor custo-benefício."
                    onClick={async () => {
                      if (live.mode !== 'hybrid') {
                        await lives.update(liveId, { mode: 'hybrid' })
                        setLive(l => l ? { ...l, mode: 'hybrid' } : l)
                      }
                    }}
                  />
                </div>
              </div>

              {/* Browser mode — redirect to presenter panel */}
              {live.mode === 'livekit' && (
                <div className="bg-accent/10 border border-accent/30 rounded-xl p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">🎙️</span>
                    <div>
                      <h3 className="font-semibold text-sm text-white">Painel do Apresentador</h3>
                      <p className="text-xs text-muted mt-0.5">Câmera, tela, participantes e chat — tudo no painel do apresentador.</p>
                    </div>
                  </div>
                  <a
                    href={`/host/${liveId}`}
                    target="_blank"
                    className="flex items-center justify-center gap-2 w-full bg-accent hover:bg-accent/90 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
                  >
                    Abrir painel do apresentador ↗
                  </a>
                </div>
              )}

              {/* OBS config */}
              {live.mode !== 'livekit' && (
                <>
                  {streamInfo ? (
                    <>
                      <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
                        <h2 className="font-semibold">Configuração do OBS</h2>
                        <InfoRow label="Servidor RTMP"   value={streamInfo.obs_server}  copy />
                        <InfoRow label="Chave de stream" value={streamInfo.stream_key}  copy secret />
                        <InfoRow label="URL HLS"         value={streamInfo.hls_url}     copy />
                      </div>
                      <div className="bg-surface border border-border rounded-xl p-5">
                        <h3 className="font-semibold text-sm mb-3">Como conectar no OBS</h3>
                        <ol className="space-y-2 text-sm text-muted list-decimal pl-4">
                          <li>Abra o OBS → Configurações → Transmissão</li>
                          <li>Serviço: <span className="text-white">Personalizado</span></li>
                          <li>Servidor: cole o Servidor RTMP acima</li>
                          <li>Chave de transmissão: cole a Chave acima</li>
                          <li>Clique em <span className="text-white">Iniciar transmissão</span></li>
                        </ol>
                      </div>
                    </>
                  ) : (
                    <div className="bg-surface border border-border rounded-xl p-5 text-center text-muted text-sm">
                      Carregando dados de stream...
                    </div>
                  )}
                </>
              )}

            </div>
          )}

          {/* ── LEADS ────────────────────────────────────────────── */}
          {tab === 'leads' && (
            <LeadsTab
              liveId={liveId}
              leads={leadsData}
              filter={leadsFilter}
              onLeadClick={(id) => setOpenLeadId(id)}
              onFilterChange={async (f) => {
                setLeadsFilter(f)
                const rows = await leadsApi.list(liveId, f).catch(() => [])
                setLeadsData(rows)
              }}
              onLeadUpdated={(updated) =>
                setLeadsData(prev => prev.map(l => l.id === updated.id ? { ...l, ...updated } : l))
              }
            />
          )}

        </main>

        {/* ── RIGHT SIDEBAR: UTM Generator ─────────────────────────── */}
        <aside className={clsx(
          'bg-surface border-l border-border flex flex-col shrink-0 transition-all duration-300 overflow-hidden',
          utmOpen ? 'w-80' : 'w-10'
        )}>
          {/* Toggle button */}
          <button
            onClick={() => setUtmOpen(v => !v)}
            className="flex items-center justify-center h-10 w-10 shrink-0 text-muted hover:text-white transition-colors border-b border-border"
            title={utmOpen ? 'Fechar UTM' : 'Abrir UTM'}
          >
            <svg className={clsx('w-4 h-4 transition-transform', utmOpen ? 'rotate-0' : 'rotate-180')} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </button>

          {utmOpen && (
            <div className="flex-1 overflow-y-auto">
              <UTMGenerator liveId={liveId} liveTitle={live.title} shortId={live.short_id} />
            </div>
          )}
        </aside>

      </div>

      {openLeadId && (
        <LeadTimelineModal
          leadId={openLeadId}
          onClose={() => setOpenLeadId(null)}
          onConverted={async () => {
            const rows = await leadsApi.list(liveId, leadsFilter).catch(() => [])
            setLeadsData(rows)
          }}
        />
      )}

      {/* ── Backstage widget (bottom-left floating) ── */}
      <div className="fixed bottom-4 left-4 z-50">
        {bsOpen ? (
          <div className="w-80 bg-surface border border-purple-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: '420px' }}>
            {/* Header */}
            <div className="px-4 py-3 bg-purple-500/10 border-b border-purple-500/20 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-sm">🎧</span>
                <span className="text-xs font-bold text-purple-300 uppercase tracking-wider">Bastidores</span>
                <span className="text-[10px] text-purple-400/50">Só admins veem</span>
              </div>
              <button onClick={() => setBsOpen(false)} className="text-muted hover:text-white text-xs">✕</button>
            </div>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2" style={{ minHeight: '200px' }}>
              {bsMessages.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-2xl mb-2">🎧</p>
                  <p className="text-muted text-xs">Envie orientações para o apresentador.</p>
                  <p className="text-muted/50 text-[10px] mt-1">Mensagens aparecem no painel do host, não na live.</p>
                </div>
              ) : (
                bsMessages.map(msg => (
                  <div key={msg.id} className="text-sm leading-relaxed break-words">
                    <span className="font-semibold text-xs mr-1.5 text-purple-400">{msg.senderName}:</span>
                    <span className="text-white/90 text-xs">{msg.content}</span>
                    <span className="text-[10px] text-muted ml-2">
                      {new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))
              )}
              <div ref={bsBottomRef} />
            </div>
            {/* Input */}
            <form onSubmit={sendBackstage} className="px-4 py-3 border-t border-purple-500/20 shrink-0">
              <div className="flex gap-2">
                <input
                  value={bsInput}
                  onChange={e => setBsInput(e.target.value)}
                  placeholder="Orientação para o apresentador..."
                  maxLength={300}
                  className="flex-1 bg-surface2 border border-purple-500/30 rounded-lg px-3 py-2 text-sm text-white placeholder-muted focus:outline-none focus:border-purple-500 transition-colors"
                />
                <button type="submit" disabled={!bsInput.trim()} className="bg-purple-600 hover:bg-purple-500 disabled:opacity-30 text-white text-sm px-3 rounded-lg transition-colors font-semibold">➤</button>
              </div>
            </form>
          </div>
        ) : (
          <button
            onClick={() => { setBsOpen(true); setBsUnread(0) }}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white px-4 py-3 rounded-full shadow-lg transition-all hover:scale-105"
          >
            <span className="text-lg">🎧</span>
            <span className="text-sm font-bold">Bastidores</span>
            {bsUnread > 0 && (
              <span className="bg-white text-purple-600 text-xs font-black px-1.5 py-0.5 rounded-full animate-pulse">{bsUnread}</span>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ModeCard({ active, icon, title, desc, onClick }: {
  active: boolean; icon: string; title: string; desc: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex-1 text-left p-4 rounded-xl border transition-all',
        active
          ? 'bg-accent/10 border-accent text-white'
          : 'bg-surface2 border-border text-muted hover:border-white/30 hover:text-white'
      )}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xl">{icon}</span>
        <span className="font-semibold text-sm">{title}</span>
        {active && <span className="ml-auto text-xs bg-accent text-white px-2 py-0.5 rounded-full">Ativo</span>}
      </div>
      <p className="text-xs opacity-70 leading-relaxed">{desc}</p>
    </button>
  )
}

function MiniStat({ label, value, colour }: { label: string; value: number; colour: string }) {
  return (
    <div className="bg-surface2 rounded-lg px-2 py-1.5 text-center">
      <p className={`font-bold text-base ${colour}`}>{value.toLocaleString('pt-BR')}</p>
      <p className="text-muted text-xs">{label}</p>
    </div>
  )
}

function FooterStat({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-xs font-semibold text-white">{value}</span>
    </div>
  )
}

function KpiCard({ icon, label, value, sub, accent }: {
  icon: string; label: string; value: any; sub: string; accent?: string
}) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <p className="text-xs text-muted font-medium">{label}</p>
      </div>
      <p className={`text-2xl font-bold ${accent ?? 'text-white'}`}>{value}</p>
      <p className="text-xs text-muted/70 mt-0.5">{sub}</p>
    </div>
  )
}

// ─── Leads Tab ────────────────────────────────────────────────────────────────

type LeadsFilter = 'all' | 'favorites' | 'blocked' | 'active'

function LeadsTab({ liveId, leads, filter, onFilterChange, onLeadUpdated, onLeadClick }: {
  liveId: string
  leads: any[]
  filter: LeadsFilter
  onFilterChange: (f: LeadsFilter) => void
  onLeadUpdated: (lead: any) => void
  onLeadClick?: (id: string) => void
}) {
  const [search,    setSearch]    = useState('')
  const [selected,  setSelected]  = useState<Set<string>>(new Set())
  const [selectAll, setSelectAll] = useState(false) // true = todos os leads (não só visíveis)
  const [bulkBusy,  setBulkBusy]  = useState(false)

  const FILTERS: { id: LeadsFilter; label: string }[] = [
    { id: 'all',       label: 'Todos' },
    { id: 'active',    label: 'Ativos' },
    { id: 'favorites', label: 'Favoritos' },
    { id: 'blocked',   label: 'Bloqueados' },
  ]

  const visible = leads.filter(l => {
    if (!search) return true
    const q = search.toLowerCase()
    return (l.name ?? '').toLowerCase().includes(q) ||
           (l.phone ?? '').includes(q) ||
           (l.email ?? '').toLowerCase().includes(q)
  })

  const allVisibleSelected = visible.length > 0 && visible.every(l => selected.has(l.id))
  const someSelected       = selected.size > 0
  // effective set: when selectAll=true operate on full leads list
  const effectiveIds       = selectAll ? leads.map(l => l.id) : Array.from(selected)

  function toggleRow(id: string) {
    setSelectAll(false)
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelectAll(false)
    if (allVisibleSelected) {
      setSelected(prev => {
        const next = new Set(prev)
        visible.forEach(l => next.delete(l.id))
        return next
      })
    } else {
      setSelected(prev => {
        const next = new Set(prev)
        visible.forEach(l => next.add(l.id))
        return next
      })
    }
  }

  function selectEveryLead() {
    setSelected(new Set(leads.map(l => l.id)))
    setSelectAll(true)
  }

  async function bulkSetFavorite(value: boolean) {
    setBulkBusy(true)
    await Promise.allSettled(
      effectiveIds.map(id => leadsApi.update(id, { is_favorite: value }).then(() => {
        const lead = leads.find(l => l.id === id)
        if (lead) onLeadUpdated({ ...lead, is_favorite: value })
      }))
    )
    setSelected(new Set())
    setSelectAll(false)
    setBulkBusy(false)
  }

  async function bulkSetBlocked(value: boolean) {
    setBulkBusy(true)
    await Promise.allSettled(
      effectiveIds.map(id => leadsApi.update(id, { is_blocked: value }).then(() => {
        const lead = leads.find(l => l.id === id)
        if (lead) onLeadUpdated({ ...lead, is_blocked: value })
      }))
    )
    setSelected(new Set())
    setSelectAll(false)
    setBulkBusy(false)
  }

  async function toggleFavorite(lead: any) {
    const updated = await leadsApi.update(lead.id, { is_favorite: !lead.is_favorite }).catch(() => null)
    if (updated) onLeadUpdated({ ...lead, is_favorite: !lead.is_favorite })
  }

  async function toggleBlock(lead: any) {
    const updated = await leadsApi.update(lead.id, { is_blocked: !lead.is_blocked }).catch(() => null)
    if (updated) onLeadUpdated({ ...lead, is_blocked: !lead.is_blocked })
  }

  function formatDuration(s: number) {
    if (!s) return '—'
    if (s < 60) return `${s}s`
    return `${Math.floor(s / 60)}m${s % 60 > 0 ? String(s % 60).padStart(2, '0') + 's' : ''}`
  }

  function formatDate(v: string | null | undefined) {
    if (!v) return '—'
    const d = new Date(v)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  function whatsappHref(phone: string) {
    const digits = phone.replace(/\D/g, '')
    const num = digits.startsWith('55') ? digits : `55${digits}`
    return `https://wa.me/${num}`
  }

  function exportLiveLeadsCsv() {
    // Exporta os leads desta live (já filtrados pelo search/filter atual).
    // Inclui campos cheios — IP, geo, score, engagement.
    const rows = visible
    const escape = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const header = [
      'Nome', 'Telefone', 'Email', 'Cidade', 'UF', 'IP',
      'Visitas', 'Tempo médio (s)', 'Mensagens', 'Cliques CTA',
      'Score', 'Status', 'Bloqueado', 'Favorito',
      'Última atividade', 'Capturado em',
    ].map(escape).join(',')
    const lines = rows.map(l => [
      l.name, l.phone, l.email, l.city, l.region, l.ip_address,
      l.total_visits ?? 1, l.avg_duration_s ?? 0, l.total_messages ?? 0, l.total_cta_clicks ?? 0,
      l.lead_score ?? 0, l.status ?? '', l.is_blocked ? 'sim' : 'não', l.is_favorite ? 'sim' : 'não',
      l.last_seen_at ? new Date(l.last_seen_at).toLocaleString('pt-BR') : '',
      l.created_at  ? new Date(l.created_at).toLocaleString('pt-BR')  : '',
    ].map(escape).join(','))
    // BOM pra Excel reconhecer UTF-8 (acentos não viram lixo)
    const csv = '﻿' + [header, ...lines].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const stamp = new Date().toISOString().slice(0, 10)
    const a = document.createElement('a')
    a.href = url
    a.download = `leads-live-${liveId.slice(0, 8)}-${stamp}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-5 space-y-4">
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => { onFilterChange(f.id); setSelected(new Set()); setSelectAll(false) }}
              className={clsx(
                'text-xs px-3 py-1.5 rounded-lg font-medium transition-colors',
                filter === f.id
                  ? 'bg-accent text-white'
                  : 'bg-surface2 text-muted hover:text-white'
              )}
            >
              {f.label}
              {f.id === 'all' && leads.length > 0 && (
                <span className="ml-1 opacity-60">{leads.length}</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar nome, telefone..."
            className="w-full sm:w-64 bg-surface2 border border-border rounded-lg px-3 py-1.5 text-sm text-white placeholder-muted focus:outline-none focus:border-accent"
          />
          <button
            onClick={exportLiveLeadsCsv}
            disabled={visible.length === 0}
            title={`Exportar ${visible.length} leads desta live`}
            className="shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium bg-surface2 hover:bg-surface text-muted hover:text-white border border-border disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
          >
            ↓ CSV
          </button>
        </div>
      </div>

      {/* Bulk action bar — slides in when rows are selected */}
      {someSelected && (
        <div className="space-y-2">
          <div className="flex items-center gap-3 bg-accent/10 border border-accent/30 rounded-xl px-4 py-2.5 flex-wrap">
            <span className="text-xs font-semibold text-accent">
              {selectAll ? leads.length : selected.size}{' '}
              {(selectAll ? leads.length : selected.size) === 1 ? 'selecionado' : 'selecionados'}
            </span>
            <div className="flex items-center gap-2 ml-auto flex-wrap">
              <button
                onClick={() => bulkSetFavorite(true)}
                disabled={bulkBusy}
                className="text-xs bg-warning/20 hover:bg-warning/30 text-warning font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                ⭐ Favoritar
              </button>
              <button
                onClick={() => bulkSetFavorite(false)}
                disabled={bulkBusy}
                className="text-xs bg-surface2 hover:bg-border text-muted hover:text-white font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                ☆ Remover favorito
              </button>
              <button
                onClick={() => bulkSetBlocked(true)}
                disabled={bulkBusy}
                className="text-xs bg-danger/10 hover:bg-danger/20 text-danger font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                🚫 Bloquear
              </button>
              <button
                onClick={() => { setSelected(new Set()); setSelectAll(false) }}
                disabled={bulkBusy}
                className="text-xs text-muted hover:text-white px-2 py-1.5 rounded-lg transition-colors"
              >
                ✕
              </button>
            </div>
            {bulkBusy && (
              <span className="w-3.5 h-3.5 border-2 border-accent border-t-transparent rounded-full animate-spin inline-block" />
            )}
          </div>

          {/* "Selecionar todos" hint — aparece quando todos os visíveis estão marcados mas ainda não é tudo */}
          {allVisibleSelected && !selectAll && leads.length > visible.length && (
            <div className="text-xs text-center text-muted py-1">
              Os {visible.length} leads visíveis estão selecionados.{' '}
              <button
                onClick={selectEveryLead}
                className="text-accent hover:underline font-semibold"
              >
                Selecionar todos os {leads.length} leads
              </button>
            </div>
          )}
          {selectAll && (
            <div className="text-xs text-center text-muted py-1">
              Todos os {leads.length} leads estão selecionados.{' '}
              <button
                onClick={() => { setSelected(new Set()); setSelectAll(false) }}
                className="text-accent hover:underline font-semibold"
              >
                Cancelar seleção
              </button>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        {visible.length === 0 ? (
          <div className="py-16 text-center text-muted text-sm">
            {search ? 'Nenhum resultado para a busca.' : 'Nenhum lead ainda.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="border-b border-border bg-surface2/50">
                  {/* Select-all checkbox */}
                  <th className="px-3 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAll}
                      className="w-3.5 h-3.5 rounded accent-[var(--color-accent)] cursor-pointer"
                    />
                  </th>
                  <th className="px-3 py-3 text-left text-muted font-medium text-xs w-6"></th>
                  <th className="px-4 py-3 text-left text-muted font-medium text-xs">Nome</th>
                  <th className="px-4 py-3 text-left text-muted font-medium text-xs">Telefone</th>
                  <th className="px-4 py-3 text-left text-muted font-medium text-xs">Visitas</th>
                  <th className="px-4 py-3 text-left text-muted font-medium text-xs">Tempo médio</th>
                  <th className="px-4 py-3 text-left text-muted font-medium text-xs">Última vez</th>
                  <th className="px-4 py-3 text-left text-muted font-medium text-xs">IP</th>
                  <th className="px-4 py-3 text-left text-muted font-medium text-xs">Status</th>
                  <th className="px-4 py-3 text-right text-muted font-medium text-xs">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((lead: any) => (
                  <tr
                    key={lead.id}
                    className={clsx(
                      'border-b border-border/40 transition-colors',
                      selected.has(lead.id) ? 'bg-accent/5' :
                      lead.is_blocked ? 'opacity-50 hover:opacity-70' : 'hover:bg-surface2/40'
                    )}
                  >
                    {/* Row checkbox */}
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(lead.id)}
                        onChange={() => toggleRow(lead.id)}
                        className="w-3.5 h-3.5 rounded accent-[var(--color-accent)] cursor-pointer"
                      />
                    </td>

                    {/* Favorite star */}
                    <td className="px-3 py-3">
                      <button
                        onClick={() => toggleFavorite(lead)}
                        title={lead.is_favorite ? 'Remover favorito' : 'Marcar favorito'}
                        className="text-base transition-transform hover:scale-125"
                      >
                        {lead.is_favorite ? '⭐' : <span className="text-white/20">☆</span>}
                      </button>
                    </td>

                    {/* Name (clickable → opens timeline) */}
                    <td
                      className={clsx('px-4 py-3', onLeadClick && 'cursor-pointer')}
                      onClick={() => onLeadClick?.(lead.id)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white hover:text-accent transition-colors">
                          {lead.name}
                        </span>
                        {lead.converted_at && <span title="Convertido">💰</span>}
                        {lead.intent_high && !lead.converted_at && (
                          <span title="Alta intenção de compra" className="text-[10px] bg-red-500/15 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded-full font-semibold">QUASE</span>
                        )}
                      </div>
                      <div className="mt-1">
                        <ScoreBadge score={lead.lead_score ?? 0} status={lead.status} />
                      </div>
                      {lead.notes && (
                        <p className="text-muted text-xs mt-0.5 truncate max-w-[200px]">{lead.notes}</p>
                      )}
                    </td>

                    {/* Phone + WhatsApp */}
                    <td className="px-4 py-3">
                      {lead.phone ? (
                        <div className="flex items-center gap-2">
                          <span className="text-white font-mono text-xs">{lead.phone}</span>
                          <a
                            href={whatsappHref(lead.phone)}
                            target="_blank"
                            rel="noreferrer"
                            title="Abrir no WhatsApp"
                            className="text-green-400 hover:text-green-300 text-base leading-none"
                          >
                            💬
                          </a>
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>

                    {/* Visits */}
                    <td className="px-4 py-3 text-center">
                      <span className={clsx(
                        'inline-block text-xs font-bold px-2 py-0.5 rounded-full',
                        lead.total_visits >= 3 ? 'bg-accent/20 text-accent' : 'bg-surface2 text-muted'
                      )}>
                        {lead.total_visits}x
                      </span>
                    </td>

                    {/* Avg duration */}
                    <td className="px-4 py-3 text-muted text-xs">
                      {formatDuration(lead.avg_duration_s)}
                    </td>

                    {/* Last seen */}
                    <td className="px-4 py-3 text-muted text-xs whitespace-nowrap">
                      {formatDate(lead.last_seen_at ?? lead.created_at)}
                    </td>

                    {/* IP + cidade (ip-api.com lookup no momento da captura) */}
                    <td className="px-4 py-3 text-muted text-xs whitespace-nowrap">
                      {lead.ip_address ? (
                        <div className="flex flex-col leading-tight">
                          <a
                            href={`https://ipinfo.io/${lead.ip_address}`}
                            target="_blank"
                            rel="noreferrer"
                            title="Ver geolocalização completa"
                            className="font-mono hover:text-accent transition-colors"
                            onClick={e => e.stopPropagation()}
                          >
                            {lead.ip_address}
                          </a>
                          {lead.city && (
                            <span className="text-[10px] text-muted/70 mt-0.5">
                              {lead.city}{lead.region ? `(${lead.region})` : ''}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span>—</span>
                      )}
                    </td>

                    {/* Status badge */}
                    <td className="px-4 py-3">
                      {lead.is_blocked ? (
                        <span className="text-xs bg-danger/20 text-danger px-2 py-0.5 rounded-full font-medium">Bloqueado</span>
                      ) : lead.is_favorite ? (
                        <span className="text-xs bg-warning/20 text-warning px-2 py-0.5 rounded-full font-medium">Favorito</span>
                      ) : (
                        <span className="text-xs bg-surface2 text-muted/60 px-2 py-0.5 rounded-full">Lead</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => toggleBlock(lead)}
                        title={lead.is_blocked ? 'Desbloquear' : 'Bloquear'}
                        className={clsx(
                          'text-xs px-2.5 py-1 rounded-lg transition-colors',
                          lead.is_blocked
                            ? 'bg-success/20 text-success hover:bg-success/30'
                            : 'bg-danger/10 text-danger/70 hover:bg-danger/20 hover:text-danger'
                        )}
                      >
                        {lead.is_blocked ? 'Desbloquear' : 'Bloquear'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function InfoRow({ label, value, copy, secret }: { label: string; value: string; copy?: boolean; secret?: boolean }) {
  const [show, setShow]     = useState(!secret)
  const [copied, setCopied] = useState(false)
  function doCopy() {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }).catch(fallback)
    } else {
      fallback()
    }
  }
  function fallback() {
    try {
      const el = document.createElement('textarea')
      el.value = value
      el.style.position = 'fixed'; el.style.opacity = '0'
      document.body.appendChild(el); el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    } catch { /* silent */ }
  }
  return (
    <div>
      <label className="block text-xs text-muted mb-1">{label}</label>
      <div className="flex gap-2 items-center">
        <input readOnly type={show ? 'text' : 'password'} value={value}
          className="flex-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none" />
        {secret && (
          <button onClick={() => setShow(s => !s)} className="text-xs text-muted hover:text-white px-2">{show ? 'Ocultar' : 'Mostrar'}</button>
        )}
        {copy && (
          <button onClick={doCopy} className="text-xs bg-surface2 hover:bg-border text-muted hover:text-white px-3 py-2 rounded-lg transition-colors shrink-0">
            {copied ? '✓' : 'Copiar'}
          </button>
        )}
      </div>
    </div>
  )
}
