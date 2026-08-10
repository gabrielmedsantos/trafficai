'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { lives, admin, leads as leadsApi, channel } from '@/lib/api'
import DashboardFilters, { type DashboardFilterValues } from '@/components/admin/DashboardFilters'
import HostAvatarBadge from '@/components/HostAvatarBadge'
import ScoreBadge from '@/components/leads/ScoreBadge'
import LeadTimelineModal from '@/components/leads/LeadTimelineModal'
import CostreamInvites from '@/components/dashboard/CostreamInvites'
import { useAuthStore } from '@/store/live.store'
import type { Live, Persona, MessageQueue } from '@/types'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import clsx from 'clsx'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import {
  LayoutDashboard, Radio, Users, MessageSquare, ShieldOff,
  Plus, LogOut, Video, Play, Clock, CheckCircle2, ExternalLink,
  Settings, Trash2, Star, ChevronRight, Loader2, Menu, X, UserCheck,
  Phone, Copy, Check,
} from 'lucide-react'

// ─── Constants ────────────────────────────────────────────────────────────────

const DEVICE_COLORS = { desktop: '#4f6ef7', mobile: '#22c55e', tablet: '#f59e0b' }
const UTM_PALETTE   = ['#4f6ef7','#22c55e','#f59e0b','#ec4899','#8b5cf6','#06b6d4','#f97316','#94a3b8']

type Section = 'overview' | 'lives' | 'personas' | 'queues' | 'banned' | 'leads'

const NAV: { id: Section; icon: React.ReactNode; label: string }[] = [
  { id: 'overview',  icon: <LayoutDashboard className="w-5 h-5" />, label: 'Visão Geral'       },
  { id: 'lives',     icon: <Radio className="w-5 h-5" />,           label: 'Minhas Lives'       },
  { id: 'leads',     icon: <UserCheck className="w-5 h-5" />,       label: 'Leads'              },
  { id: 'personas',  icon: <Users className="w-5 h-5" />,           label: 'Personas'           },
  { id: 'queues',    icon: <MessageSquare className="w-5 h-5" />,   label: 'Filas de Mensagens' },
  { id: 'banned',    icon: <ShieldOff className="w-5 h-5" />,       label: 'Palavras Banidas'   },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtSecs(s: number) {
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60); const rem = s % 60
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`
}
function fmtDay(iso: string) {
  try { return format(new Date(iso), 'dd/MM', { locale: ptBR }) } catch { return iso }
}

const STATUS_STYLE = {
  waiting: 'text-warning border-warning/30 bg-warning/10',
  live:    'text-success border-success/30 bg-success/10',
  ended:   'text-muted  border-border     bg-surface2',
}
const STATUS_LABEL = { waiting: 'AGUARDANDO', live: '● AO VIVO', ended: 'ENCERRADA' }

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router    = useRouter()
  const token     = useAuthStore((s) => s.token)
  const user      = useAuthStore((s) => s.user)
  const clearAuth = useAuthStore((s) => s.clearAuth)

  const [section, setSection]   = useState<Section>('overview')
  // Link fixo do canal — slug do user logado (resolved on first load)
  const [channelSlug, setChannelSlug] = useState<string | null>(null)
  const [editingSlug, setEditingSlug] = useState(false)
  const [slugInput, setSlugInput]     = useState('')
  const [slugBusy, setSlugBusy]       = useState(false)
  const [slugError, setSlugError]     = useState('')
  const [slugCopied, setSlugCopied]   = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [liveList, setLiveList] = useState<Live[]>([])
  const [stats, setStats]       = useState<any>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  // Personas
  const [personas, setPersonas]           = useState<Persona[]>([])
  const [newPersonaName, setNewPersonaName] = useState('')
  const [addingPersona, setAddingPersona]   = useState(false)

  // Queues
  const [queues, setQueues]       = useState<MessageQueue[]>([])
  const [newQueueName, setNewQueueName] = useState('')
  const [addingQueue, setAddingQueue]   = useState(false)

  // Banned words
  const [banned, setBanned]         = useState<string[]>([])
  const [newWord, setNewWord]       = useState('')
  const [addingWord, setAddingWord] = useState(false)

  // All leads
  const [allLeads, setAllLeads]         = useState<any[]>([])
  const [openLeadId, setOpenLeadId]     = useState<string | null>(null)
  const [leadsFilter, setLeadsFilter]   = useState<'all' | 'favorites' | 'blocked'>('all')
  const [leadsLoading, setLeadsLoading] = useState(false)
  const [leadsSearch, setLeadsSearch]   = useState('')
  const [leadsSort, setLeadsSort]       = useState<'score' | 'active' | 'clicks'>('score')
  const [copiedPhone, setCopiedPhone]   = useState<string | null>(null)

  // Dashboard filters
  const [statsLoading, setStatsLoading] = useState(false)

  useEffect(() => {
    if (!token) { router.push('/login'); return }
    loadAll()
    channel.me().then(r => setChannelSlug(r.slug)).catch(() => {})
  }, [token])

  async function saveSlug() {
    const v = slugInput.trim().toLowerCase()
    if (!v) { setSlugError('Slug não pode ser vazio'); return }
    if (!/^[a-z0-9][a-z0-9-]{2,38}$/.test(v)) {
      setSlugError('Use letras minúsculas, números e hífen (3-40 chars).')
      return
    }
    setSlugBusy(true); setSlugError('')
    try {
      const r = await channel.update(v)
      setChannelSlug(r.slug)
      setEditingSlug(false)
    } catch (e: any) {
      setSlugError(e.message ?? 'Erro ao salvar')
    } finally {
      setSlugBusy(false)
    }
  }

  async function copySlug() {
    if (!channelSlug) return
    const url = `${window.location.origin}/c/${channelSlug}`
    try {
      await navigator.clipboard.writeText(url)
      setSlugCopied(true)
      setTimeout(() => setSlugCopied(false), 1500)
    } catch {}
  }

  async function loadAll() {
    setLoading(true); setError(null)
    const errors: string[] = []

    const safe = async <T,>(fn: () => Promise<T>, fallback: T, critical = false): Promise<T> => {
      try { return await fn() } catch (e: any) { if (critical) errors.push(e.message); return fallback }
    }

    const [list, s, p, q, bw] = await Promise.all([
      safe(lives.list,            [],   true),
      safe(lives.dashboardStats,  null, false),  // non-critical — shows zeros if missing
      safe(admin.listPersonas,    [],   true),
      safe(admin.listQueues,      [],   false),
      safe(admin.listBannedWords, [],   false),
    ])

    setLiveList(list as Live[])
    setStats(s)
    setPersonas(p as Persona[])
    setQueues(q as MessageQueue[])
    setBanned(bw as string[])

    // Load all leads
    const ld = await safe(() => leadsApi.listAll('all'), [])
    setAllLeads(ld as any[])

    if (errors.length) setError(errors.join(', '))
    setLoading(false)
  }

  async function applyDashboardFilters(filters: DashboardFilterValues) {
    setStatsLoading(true)
    try {
      const s = await lives.dashboardStats(filters)
      setStats(s)
    } catch { /* keep previous stats */ }
    finally { setStatsLoading(false) }
  }

  async function addPersona() {
    if (!newPersonaName.trim()) return
    setAddingPersona(true)
    try {
      const p = await admin.createPersona({ name: newPersonaName.trim() })
      setPersonas(prev => [...prev, p])
      setNewPersonaName('')
    } catch (e: any) { alert(e.message) }
    finally { setAddingPersona(false) }
  }

  async function removePersona(id: string) {
    if (!confirm('Remover persona?')) return
    try { await admin.deletePersona(id); setPersonas(prev => prev.filter(p => p.id !== id)) }
    catch (e: any) { alert(e.message) }
  }

  async function toggleFavorite(p: Persona) {
    try {
      const updated = await admin.updatePersona(p.id, { is_favorite: !p.is_favorite })
      setPersonas(prev => prev.map(x => x.id === p.id ? { ...x, ...updated } : x)
        .sort((a, b) => Number(b.is_favorite) - Number(a.is_favorite) || a.name.localeCompare(b.name)))
    } catch (e: any) { alert(e.message) }
  }

  async function removeQueue(id: string) {
    if (!confirm('Remover fila?')) return
    try { await admin.deleteQueue(id); setQueues(prev => prev.filter(q => q.id !== id)) }
    catch (e: any) { alert(e.message) }
  }

  async function addBannedWord() {
    if (!newWord.trim()) return
    setAddingWord(true)
    try {
      await admin.addBannedWord(newWord.trim().toLowerCase())
      setBanned(prev => [...prev, newWord.trim().toLowerCase()])
      setNewWord('')
    } catch (e: any) { alert(e.message) }
    finally { setAddingWord(false) }
  }

  async function removeBannedWord(word: string) {
    try { await admin.removeBannedWord(word); setBanned(prev => prev.filter(w => w !== word)) }
    catch (e: any) { alert(e.message) }
  }

  async function loadLeads(filter: 'all' | 'favorites' | 'blocked', sort?: 'score' | 'active' | 'clicks') {
    setLeadsLoading(true)
    try {
      const rows = await leadsApi.listAll(filter, sort ?? leadsSort)
      setAllLeads(rows)
    } catch { /* silent */ }
    finally { setLeadsLoading(false) }
  }

  async function toggleLeadFavorite(lead: any) {
    try {
      await leadsApi.update(lead.id, { is_favorite: !lead.is_favorite })
      setAllLeads(prev => prev.map(l => l.id === lead.id ? { ...l, is_favorite: !l.is_favorite } : l))
    } catch (e: any) { alert(e.message) }
  }

  async function toggleLeadBlocked(lead: any) {
    try {
      await leadsApi.update(lead.id, { is_blocked: !lead.is_blocked })
      setAllLeads(prev => prev.map(l => l.id === lead.id ? { ...l, is_blocked: !l.is_blocked } : l))
    } catch (e: any) { alert(e.message) }
  }

  function copyPhone(phone: string) {
    navigator.clipboard.writeText(phone).catch(() => {})
    setCopiedPhone(phone)
    setTimeout(() => setCopiedPhone(null), 1500)
  }

  function exportLeadsCsv() {
    // Backend /leads/all já agrupa por phone (server-side dedup), mas como
    // defesa extra removemos duplicatas aqui no client caso phones cheguem
    // com formatações diferentes (ex: "11999998888" vs "(11) 99999-8888").
    // A chave de dedup normaliza pra só dígitos. Sem phone → fallback id.
    const seen = new Set<string>()
    const dedup: any[] = []
    for (const l of visibleLeads) {
      const phoneDigits = (l.phone ?? '').replace(/\D/g, '')
      const key = phoneDigits || `id:${l.id}`
      if (seen.has(key)) continue
      seen.add(key)
      dedup.push(l)
    }

    const escape = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const header = [
      'Nome', 'Telefone', 'Email', 'Cidade', 'UF', 'IP',
      'Total visitas', 'Lives participadas', 'Mensagens', 'Cliques CTA',
      'Score', 'Status', 'Bloqueado', 'Favorito',
      'Origem (UTM)', 'Lives (títulos)',
      'Última atividade', 'Capturado em',
    ].map(escape).join(',')
    const lines = dedup.map(l => [
      l.name, l.phone, l.email, l.city, l.region, l.ip_address,
      l.total_visits ?? 1, l.lives_count ?? 1, l.total_messages ?? 0, l.total_cta_clicks ?? 0,
      l.lead_score ?? 0, l.status ?? '', l.is_blocked ? 'sim' : 'não', l.is_favorite ? 'sim' : 'não',
      l.utm_source ?? '', l.live_title ?? '',
      l.last_activity ? new Date(l.last_activity).toLocaleString('pt-BR') : '',
      l.created_at    ? new Date(l.created_at).toLocaleString('pt-BR')    : '',
    ].map(escape).join(','))

    // BOM UTF-8 — Excel abre com acento certo
    const csv = '﻿' + [header, ...lines].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const stamp = new Date().toISOString().slice(0, 10)
    const a = document.createElement('a')
    a.href = url
    a.download = `leads-todos-${stamp}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function logout() { clearAuth(); router.push('/login') }

  const visibleLeads = allLeads.filter(l => {
    if (leadsFilter === 'favorites' && !l.is_favorite) return false
    if (leadsFilter === 'blocked'   && !l.is_blocked)  return false
    if (leadsSearch.trim()) {
      const q = leadsSearch.toLowerCase()
      return l.name?.toLowerCase().includes(q) || l.phone?.includes(q) || l.live_title?.toLowerCase().includes(q)
    }
    return true
  })

  const liveNow    = liveList.filter(l => l.status === 'live').length
  const dailyData  = stats?.daily ?? []
  const deviceData = (stats?.devices ?? []).map((d: any) => ({
    name:  d.device === 'desktop' ? 'Desktop' : d.device === 'mobile' ? 'Mobile' : 'Tablet',
    value: d.count,
    color: DEVICE_COLORS[d.device as keyof typeof DEVICE_COLORS] ?? '#94a3b8',
  }))
  const utmData = (stats?.utmSources ?? []).map((u: any, i: number) => ({
    name: u.source, value: u.count, color: UTM_PALETTE[i % UTM_PALETTE.length],
  }))

  return (
    <div className="fixed inset-0 flex bg-bg overflow-hidden">

      {/* ── Mobile overlay ── */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar ── */}
      <aside className={clsx(
        'w-60 bg-surface border-r border-border flex flex-col shrink-0 z-50',
        'fixed lg:static inset-y-0 left-0 transition-transform duration-300',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )}>
        {/* Logo */}
        <div className="px-5 py-5 border-b border-border flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-danger pulse-live inline-block" />
              <span className="font-bold text-base">LiveStack</span>
            </div>
            <p className="text-muted text-sm mt-1 truncate">{user?.name}</p>
          </div>
          <HostAvatarBadge size="sm" />
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-muted hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV.map(n => (
            <button
              key={n.id}
              onClick={() => { setSection(n.id); setSidebarOpen(false) }}
              className={clsx(
                'w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm transition-all text-left',
                section === n.id
                  ? 'bg-accent/15 text-white font-medium border border-accent/20'
                  : 'text-muted hover:text-white hover:bg-surface2 border border-transparent'
              )}
            >
              <span className={section === n.id ? 'text-accent' : ''}>{n.icon}</span>
              {n.label}
              {section === n.id && <ChevronRight className="w-4 h-4 ml-auto text-accent/60" />}
            </button>
          ))}
        </nav>

        {/* Bottom actions */}
        <div className="px-3 py-4 border-t border-border space-y-1">
          <Link
            href="/dashboard/lives/new"
            onClick={() => setSidebarOpen(false)}
            className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm text-accent hover:bg-accent/10 transition-all border border-transparent hover:border-accent/20"
          >
            <Plus className="w-5 h-5" /> Nova Live
          </Link>
          <Link
            href="/settings"
            onClick={() => setSidebarOpen(false)}
            className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm text-muted hover:text-white hover:bg-surface2 transition-colors border border-transparent"
          >
            <Settings className="w-5 h-5" /> Configurações
          </Link>
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm text-muted hover:text-white hover:bg-surface2 transition-colors border border-transparent"
          >
            <LogOut className="w-5 h-5" /> Sair
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 overflow-y-auto">

        {/* Header bar */}
        <div className="sticky top-0 z-10 bg-bg/80 backdrop-blur border-b border-border px-5 lg:px-6 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-muted hover:text-white p-1">
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="font-semibold text-sm">{NAV.find(n => n.id === section)?.label}</h1>
          </div>
          <div className="flex items-center gap-3">
            {liveNow > 0 && (
              <div className="flex items-center gap-1.5 text-success text-xs font-semibold bg-success/10 border border-success/20 px-3 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-success pulse-live inline-block" />
                {liveNow} ao vivo agora
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="m-6 bg-danger/10 border border-danger/30 text-danger text-sm px-4 py-3 rounded-xl">
            Erro ao carregar: {error} —{' '}
            <button onClick={loadAll} className="underline">tentar novamente</button>
          </div>
        )}

        <div className="p-6">

          {/* ── VISÃO GERAL ───────────────────────────────────────── */}
          {section === 'overview' && (
            <div className="space-y-6">
              {/* Dashboard filters */}
              <DashboardFilters
                lives={liveList.map(l => ({ id: l.id, title: l.title, status: l.status, created_at: l.created_at }))}
                onApply={applyDashboardFilters}
                loading={statsLoading}
              />

              {/* ── Card: link fixo do canal ── */}
              {channelSlug && (
                <div className="bg-gradient-to-br from-accent/10 via-surface to-surface border border-accent/30 rounded-xl p-5">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-white text-sm">Seu link fixo</h3>
                        <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">Sempre ativo</span>
                      </div>
                      <p className="text-muted text-xs mb-3">
                        Compartilhe ESTE link em qualquer lugar (bio do Instagram, WhatsApp, Stories). Ele sempre abre a live que está rolando agora.
                      </p>

                      {!editingSlug ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <code className="flex-1 min-w-[200px] bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-white font-mono break-all">
                            liveglobalx.com/c/{channelSlug}
                          </code>
                          <button
                            onClick={copySlug}
                            className="text-xs font-semibold px-3 py-2 rounded-lg bg-accent hover:bg-accent/90 text-white transition-colors shrink-0"
                          >
                            {slugCopied ? '✓ Copiado' : 'Copiar'}
                          </button>
                          <button
                            onClick={() => { setSlugInput(channelSlug ?? ''); setEditingSlug(true); setSlugError('') }}
                            className="text-xs text-muted hover:text-white transition-colors shrink-0"
                          >
                            Editar
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted shrink-0">liveglobalx.com/c/</span>
                            <input
                              autoFocus
                              value={slugInput}
                              onChange={e => setSlugInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                              placeholder="seu-canal"
                              maxLength={40}
                              className="flex-1 min-w-0 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-muted focus:outline-none focus:border-accent font-mono"
                            />
                          </div>
                          {slugError && <p className="text-danger text-xs">{slugError}</p>}
                          <div className="flex gap-2">
                            <button
                              onClick={saveSlug}
                              disabled={slugBusy}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-accent hover:bg-accent/90 disabled:opacity-50 text-white transition-colors"
                            >
                              {slugBusy ? 'Salvando…' : 'Salvar'}
                            </button>
                            <button
                              onClick={() => { setEditingSlug(false); setSlugError('') }}
                              className="text-xs px-3 py-1.5 rounded-lg bg-surface2 hover:bg-surface text-muted hover:text-white transition-colors"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* KPI row 1 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard label="Lives Ao Vivo"       value={loading ? '—' : liveNow}                                  sub={`${stats?.lives?.total ?? 0} criadas`}       icon="📡" highlight={liveNow > 0} />
                <KpiCard label="Retenção Média"       value={loading ? '—' : fmtSecs(stats?.avgWatchSecs ?? 0)}        sub="tempo médio assistido"                        icon="⏱" />
                <KpiCard label="Espectadores Únicos"  value={loading ? '—' : (stats?.viewers ?? 0).toLocaleString()}   sub="joins totais"                                 icon="👁" />
                <KpiCard label="Leads Capturados"     value={loading ? '—' : (stats?.leads ?? 0).toLocaleString()}     sub={`${stats?.messages ?? 0} msgs reais`}         icon="🎯" />
              </div>

              {/* KPI row 2 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <KpiCard label="Taxa de Conversão" value={loading ? '—' : `${stats?.convRate ?? '0.0'}%`}           sub="leads / espectadores"        icon="📈" small />
                <KpiCard label="Lives Encerradas"  value={loading ? '—' : stats?.lives?.ended ?? 0}                 sub={`${stats?.lives?.waiting ?? 0} aguardando`}  icon="🎬" small />
                <KpiCard label="Mensagens Reais"   value={loading ? '—' : (stats?.messages ?? 0).toLocaleString()}  sub="enviadas pelos viewers"       icon="💬" small />
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-surface border border-border rounded-xl p-5">
                  <h3 className="font-semibold text-sm mb-0.5">Audiência e Tráfego</h3>
                  <p className="text-muted text-xs mb-4">Últimos 14 dias</p>
                  {dailyData.length === 0 ? (
                    <div className="h-44 flex items-center justify-center text-muted text-xs">Nenhum dado ainda — realize suas primeiras lives</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={dailyData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                        <CartesianGrid stroke="#334155" strokeDasharray="3 3" vertical={false} opacity={0.35} />
                        <XAxis
                          dataKey="day"
                          tick={{ fontSize: 11, fill: '#cbd5e1' }}
                          tickFormatter={fmtDay}
                          axisLine={{ stroke: '#334155' }}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: '#cbd5e1' }}
                          allowDecimals={false}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          contentStyle={{ background: '#0f172a', border: '1px solid #475569', borderRadius: 8, fontSize: 12, color: '#e2e8f0' }}
                          labelStyle={{ color: '#ffffff', fontWeight: 600, marginBottom: 4 }}
                          itemStyle={{ color: '#c084fc' }}
                          labelFormatter={fmtDay}
                          formatter={(v: any) => [v, 'Entradas']}
                        />
                        <Line
                          type="monotone"
                          dataKey="joins"
                          stroke="#a855f7"
                          strokeWidth={2.5}
                          dot={false}
                          activeDot={{ r: 5, fill: '#ffffff', stroke: '#a855f7', strokeWidth: 2 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <div className="bg-surface border border-border rounded-xl p-5">
                  <h3 className="font-semibold text-sm mb-0.5">Dispositivos</h3>
                  <p className="text-muted text-xs mb-4">Distribuição dos espectadores</p>
                  {deviceData.length === 0 ? (
                    <div className="h-44 flex items-center justify-center text-muted text-xs">Sem dados</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={deviceData} cx="50%" cy="45%" outerRadius={65} dataKey="value" stroke="none">
                          {deviceData.map((d: any, i: number) => <Cell key={i} fill={d.color} />)}
                        </Pie>
                        <Legend
                          iconType="circle"
                          iconSize={8}
                          formatter={(value) => <span style={{ color: '#e2e8f0' }}>{value}</span>}
                          wrapperStyle={{ fontSize: 11 }}
                        />
                        <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* UTM + quick live list */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="bg-surface border border-border rounded-xl p-5">
                  <h3 className="font-semibold text-sm mb-0.5">Origem do Tráfego</h3>
                  <p className="text-muted text-xs mb-4">Fonte UTM dos espectadores</p>
                  {utmData.length === 0 ? (
                    <div className="py-6 text-center text-muted text-xs space-y-2">
                      <p>Nenhum dado ainda.</p>
                      <p>Use o <span className="text-accent font-medium">Gerador de UTMs</span> no painel de cada live para distribuir links rastreados.</p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2 mt-1">
                        {(() => {
                          const total = utmData.reduce((s: number, d: any) => s + d.value, 0)
                          return utmData.map((d: any, i: number) => (
                            <div key={i}>
                              <div className="flex items-center justify-between mb-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                                  <span className="text-xs text-white capitalize">{d.name}</span>
                                </div>
                                <span className="text-xs text-muted">{d.value} <span className="text-muted/60">({((d.value/total)*100).toFixed(0)}%)</span></span>
                              </div>
                              <div className="h-1.5 bg-surface2 rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all" style={{ width: `${(d.value/total)*100}%`, background: d.color }} />
                              </div>
                            </div>
                          ))
                        })()}
                      </div>
                    </>
                  )}
                </div>

                <div className="lg:col-span-2 bg-surface border border-border rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-sm">Lives recentes</h3>
                      <p className="text-muted text-xs mt-0.5">{liveList.length} criadas</p>
                    </div>
                    <button onClick={() => setSection('lives')} className="text-xs text-accent hover:underline">Ver todas →</button>
                  </div>
                  {loading ? (
                    <div className="py-10 text-center text-muted text-sm">Carregando...</div>
                  ) : liveList.length === 0 ? (
                    <div className="py-10 text-center">
                      <p className="text-muted text-sm">Nenhuma live criada ainda.</p>
                      <Link href="/dashboard/lives/new" className="mt-2 inline-block text-accent text-sm hover:underline">Criar primeira live →</Link>
                    </div>
                  ) : (
                    <div className="divide-y divide-border/50">
                      {liveList.slice(0, 5).map(live => <LiveRow key={live.id} live={live} currentUserId={user?.id}
    onEnd={id => setLiveList(prev => prev.map(l => l.id === id ? { ...l, status: 'ended' } : l))}
    onDelete={id => setLiveList(prev => prev.filter(l => l.id !== id))} />)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── MINHAS LIVES ──────────────────────────────────────── */}
          {section === 'lives' && (
            <div className="space-y-6">
              {/* Costream Invites */}
              <CostreamInvites />

              <div className="flex items-center justify-between">
                <p className="text-muted text-sm">{liveList.length} live{liveList.length !== 1 ? 's' : ''} criada{liveList.length !== 1 ? 's' : ''}</p>
                <Link href="/dashboard/lives/new" className="bg-accent hover:bg-accent/90 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                  + Nova Live
                </Link>
              </div>

              {loading ? (
                <div className="py-16 text-center text-muted">Carregando...</div>
              ) : liveList.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="text-4xl mb-3">📡</div>
                  <p className="text-muted text-sm mb-2">Nenhuma live criada ainda.</p>
                  <Link href="/dashboard/lives/new" className="text-accent text-sm hover:underline">Criar primeira live →</Link>
                </div>
              ) : (
                <div className="bg-surface border border-border rounded-xl overflow-hidden divide-y divide-border/50">
                  {liveList.map(live => <LiveRow key={live.id} live={live} currentUserId={user?.id}
    onEnd={id => setLiveList(prev => prev.map(l => l.id === id ? { ...l, status: 'ended' } : l))}
    onDelete={id => setLiveList(prev => prev.filter(l => l.id !== id))} />)}
                </div>
              )}
            </div>
          )}

          {/* ── LEADS ────────────────────────────────────────────── */}
          {section === 'leads' && (() => {
            const timeAgo = (iso: string | null) => {
              if (!iso) return '—'
              const diff = Date.now() - new Date(iso).getTime()
              const m = Math.floor(diff / 60000)
              if (m < 1) return 'agora'
              if (m < 60) return `${m}min`
              const h = Math.floor(m / 60)
              if (h < 24) return `${h}h`
              return `${Math.floor(h / 24)}d`
            }
            const fmtWatch = (s: number) => {
              if (!s || s < 60) return `${s || 0}s`
              return `${Math.floor(s / 60)}m`
            }
            const SORTS: { id: 'score' | 'active' | 'clicks'; label: string }[] = [
              { id: 'score',  label: '🔥 Mais quentes' },
              { id: 'active', label: '⏱ Mais ativos' },
              { id: 'clicks', label: '🎯 Mais cliques' },
            ]
            return (
            <div className="space-y-4">
              {/* Header row */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                <p className="text-muted text-sm">{allLeads.length} lead{allLeads.length !== 1 ? 's' : ''} capturado{allLeads.length !== 1 ? 's' : ''}</p>
                <div className="flex items-center gap-2">
                  <button onClick={exportLeadsCsv}
                    className="text-xs bg-surface2 hover:bg-border text-muted hover:text-white px-3 py-2 rounded-lg transition-colors border border-border">
                    ↓ Exportar CSV
                  </button>
                </div>
              </div>

              {/* Filters + search + sort */}
              <div className="flex flex-col sm:flex-row gap-2">
                <input value={leadsSearch} onChange={e => setLeadsSearch(e.target.value)}
                  placeholder="Buscar por nome, telefone ou live..."
                  className="flex-1 bg-surface border border-border rounded-xl px-4 py-2.5 text-sm text-white placeholder-muted focus:outline-none focus:border-accent" />
                <div className="flex gap-1 bg-surface border border-border rounded-xl p-1">
                  {(['all', 'favorites', 'blocked'] as const).map(f => (
                    <button key={f} onClick={() => { setLeadsFilter(f); loadLeads(f) }}
                      className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                        leadsFilter === f ? 'bg-accent text-white' : 'text-muted hover:text-white')}>
                      {f === 'all' ? 'Todos' : f === 'favorites' ? '⭐ Favoritos' : '🚫 Bloqueados'}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1 bg-surface border border-border rounded-xl p-1">
                  {SORTS.map(s => (
                    <button key={s.id} onClick={() => { setLeadsSort(s.id); loadLeads(leadsFilter, s.id) }}
                      className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                        leadsSort === s.id ? 'bg-accent text-white' : 'text-muted hover:text-white')}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Table */}
              {leadsLoading ? (
                <div className="py-16 text-center text-muted text-sm">Carregando...</div>
              ) : visibleLeads.length === 0 ? (
                <div className="py-16 text-center text-muted text-sm">Nenhum lead encontrado.</div>
              ) : (
                <div className="bg-surface border border-border rounded-xl overflow-hidden overflow-x-auto">
                  {/* Header */}
                  <div className="grid grid-cols-[2.5fr_1.2fr_1.3fr_2fr_1.3fr_1fr_0.7fr] px-4 py-2.5 border-b border-border text-[10px] text-muted font-semibold uppercase tracking-wider hidden sm:grid">
                    <span>Nome</span>
                    <span>Temperatura</span>
                    <span>Interação (CTA)</span>
                    <span>Engajamento</span>
                    <span>Origem</span>
                    <span>Atividade</span>
                    <span className="text-right">Ações</span>
                  </div>
                  <div className="divide-y divide-border/50">
                    {visibleLeads.map(lead => {
                      const score    = lead.lead_score ?? 0
                      const hot      = lead.intent_high && !lead.converted_at
                      const conv     = !!lead.converted_at
                      const ctaClk   = lead.total_cta_clicks ?? 0
                      const watchSec = lead.total_watch_time_seconds ?? 0
                      const msgs     = lead.total_messages ?? 0
                      const sessions = lead.total_sessions ?? 0
                      const utmSrc   = lead.utm_source ?? 'direto'
                      const utmCamp  = lead.utm_campaign
                      const lastAct  = lead.last_activity
                      const lastCta  = lead.last_cta_at

                      return (
                      <div key={lead.id} onClick={() => setOpenLeadId(lead.id)}
                        className={clsx('px-4 py-3 hover:bg-surface2/40 transition-colors cursor-pointer', lead.is_blocked && 'opacity-50')}>
                        {/* Mobile */}
                        <div className="sm:hidden space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-sm font-medium text-white truncate">{lead.name}</span>
                              {conv && <span className="text-xs">💰</span>}
                              {hot  && <span className="text-[10px] bg-red-500/15 text-red-400 px-1.5 rounded-full">QUASE</span>}
                            </div>
                            <ScoreBadge score={score} status={lead.status} />
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted">
                            <span>🎯 {ctaClk}</span>
                            <span>⏱️ {fmtWatch(watchSec)}</span>
                            <span>💬 {msgs}</span>
                            <span className="ml-auto">{timeAgo(lastAct)}</span>
                          </div>
                          {lead.phone && (
                            <button onClick={e => { e.stopPropagation(); copyPhone(lead.phone) }} className="flex items-center gap-1 text-xs text-muted hover:text-white">
                              <Phone className="w-3 h-3" /> {lead.phone}
                              {copiedPhone === lead.phone ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                            </button>
                          )}
                          {lead.city && (
                            <p className="text-[10px] text-muted/70 truncate">
                              🌎 {lead.city}{lead.region ? `(${lead.region})` : ''}
                            </p>
                          )}
                        </div>

                        {/* Desktop */}
                        <div className="hidden sm:grid grid-cols-[2.5fr_1.2fr_1.3fr_2fr_1.3fr_1fr_0.7fr] items-center gap-2">
                          {/* Nome */}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm text-white font-semibold truncate">{lead.name}</span>
                              {conv && <span title="Convertido" className="text-xs shrink-0">💰</span>}
                              {hot  && <span title="Alta intenção" className="text-[10px] bg-red-500/15 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded-full font-semibold shrink-0">QUASE</span>}
                            </div>
                            {lead.phone && (
                              <button onClick={e => { e.stopPropagation(); copyPhone(lead.phone) }}
                                className="flex items-center gap-1 text-[11px] text-muted hover:text-white mt-0.5 group">
                                <Phone className="w-3 h-3" />
                                <span className="truncate">{lead.phone}</span>
                                {copiedPhone === lead.phone ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100" />}
                              </button>
                            )}
                            <p className="text-[10px] text-muted/60 truncate mt-0.5">{lead.live_title}</p>
                          </div>

                          {/* Temperatura */}
                          <ScoreBadge score={score} status={lead.status} />

                          {/* Interação (CTA) */}
                          <div title={`${ctaClk} cliques no CTA${lastCta ? ` · último ${timeAgo(lastCta)}` : ''}`}>
                            {ctaClk > 0 ? (
                              <div>
                                <p className="text-xs text-white font-semibold">🎯 {ctaClk} clique{ctaClk !== 1 ? 's' : ''}</p>
                                {lastCta && <p className="text-[10px] text-muted">último {timeAgo(lastCta)}</p>}
                              </div>
                            ) : (
                              <span className="text-xs text-muted/40">—</span>
                            )}
                          </div>

                          {/* Engajamento */}
                          <div title={`${fmtWatch(watchSec)} assistido · ${msgs} msgs · ${sessions} live${sessions !== 1 ? 's' : ''}`}>
                            <div className="flex items-center gap-2.5 text-xs">
                              <span className="text-muted" title="Tempo assistido">⏱️ <span className="text-white font-semibold">{fmtWatch(watchSec)}</span></span>
                              <span className="text-muted" title="Mensagens">💬 <span className="text-white font-semibold">{msgs}</span></span>
                              <span className="text-muted" title="Lives">🎥 <span className="text-white font-semibold">{sessions}</span></span>
                            </div>
                          </div>

                          {/* Origem (UTM + geo) */}
                          <div title={[
                            utmCamp ? `${utmSrc} / ${utmCamp}` : utmSrc,
                            lead.city ? `${lead.city}${lead.region ? `(${lead.region})` : ''}` : null,
                            lead.ip_address ?? null,
                          ].filter(Boolean).join(' · ')}>
                            <p className="text-xs text-muted truncate">📍 {utmSrc}</p>
                            {utmCamp && <p className="text-[10px] text-muted/50 truncate">{utmCamp}</p>}
                            {lead.city && (
                              <p className="text-[10px] text-muted/70 truncate mt-0.5">
                                🌎 {lead.city}{lead.region ? `(${lead.region})` : ''}
                              </p>
                            )}
                          </div>

                          {/* Última atividade */}
                          <div title={lastAct ? new Date(lastAct).toLocaleString('pt-BR') : ''}>
                            <p className={clsx('text-xs font-medium',
                              !lastAct ? 'text-muted/40' :
                              (Date.now() - new Date(lastAct).getTime()) < 300000 ? 'text-green-400' : 'text-muted'
                            )}>
                              {!lastAct ? '—' : (Date.now() - new Date(lastAct).getTime()) < 300000 ? '🟢 agora' : timeAgo(lastAct)}
                            </p>
                          </div>

                          {/* Ações */}
                          <div className="flex items-center gap-0.5 justify-end" onClick={e => e.stopPropagation()}>
                            <button onClick={() => toggleLeadFavorite(lead)} title={lead.is_favorite ? 'Remover favorito' : 'Favoritar'}
                              className={clsx('text-sm p-1 rounded hover:bg-surface2', lead.is_favorite ? 'text-amber-400' : 'text-muted/30 hover:text-muted')}>
                              {lead.is_favorite ? '⭐' : '☆'}
                            </button>
                            <button onClick={() => toggleLeadBlocked(lead)} title={lead.is_blocked ? 'Desbloquear' : 'Bloquear'}
                              className={clsx('text-xs p-1 rounded hover:bg-surface2', lead.is_blocked ? 'text-danger' : 'text-muted/30 hover:text-muted')}>
                              🚫
                            </button>
                            <ChevronRight className="w-3.5 h-3.5 text-muted/40" />
                          </div>
                        </div>
                      </div>
                    )})}
                  </div>
                </div>
              )}
            </div>
          )})()}

          {/* ── PERSONAS ──────────────────────────────────────────── */}
          {section === 'personas' && (
            <div className="space-y-4 max-w-2xl">
              <p className="text-muted text-sm">Personas são os nomes que os bots do chat usam. Marque favoritas para usá-las no Multi-bot.</p>

              {/* Add form */}
              <div className="bg-surface border border-border rounded-xl p-4">
                <label className="block text-xs text-muted mb-2">Adicionar persona</label>
                <div className="flex gap-2">
                  <input
                    value={newPersonaName}
                    onChange={e => setNewPersonaName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addPersona()}
                    placeholder="Ex: Maria Silva, João Costa..."
                    className="flex-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-muted focus:outline-none focus:border-accent"
                  />
                  <button
                    onClick={addPersona}
                    disabled={addingPersona || !newPersonaName.trim()}
                    className="bg-accent hover:bg-accent/90 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg transition-colors font-medium"
                  >
                    {addingPersona ? '...' : 'Adicionar'}
                  </button>
                </div>
              </div>

              {/* List */}
              {loading ? (
                <div className="py-10 text-center text-muted text-sm">Carregando...</div>
              ) : personas.length === 0 ? (
                <div className="py-10 text-center text-muted text-sm">Nenhuma persona ainda.</div>
              ) : (
                <div className="bg-surface border border-border rounded-xl overflow-hidden divide-y divide-border/50">
                  {personas.map(p => (
                    <div key={p.id} className="flex items-center gap-3 px-4 py-3 hover:bg-surface2/40 transition-colors">
                      <button
                        onClick={() => toggleFavorite(p)}
                        title={p.is_favorite ? 'Remover dos favoritos' : 'Marcar como favorita'}
                        className={clsx(
                          'text-lg transition-colors',
                          p.is_favorite ? 'text-amber-400' : 'text-muted/40 hover:text-muted'
                        )}
                      >
                        {p.is_favorite ? '⭐' : '☆'}
                      </button>
                      <span className="flex-1 text-sm text-white">{p.name}</span>
                      {p.is_favorite && (
                        <span className="text-xs text-amber-400/70 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">favorita</span>
                      )}
                      <button
                        onClick={() => removePersona(p.id)}
                        className="text-muted/40 hover:text-danger text-xs transition-colors px-1"
                        title="Remover"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── FILAS ─────────────────────────────────────────────── */}
          {section === 'queues' && (
            <div className="space-y-4 max-w-2xl">
              <p className="text-muted text-sm">Filas de mensagens são sequências pré-programadas de mensagens de bot que você dispara durante a live.</p>

              {loading ? (
                <div className="py-10 text-center text-muted text-sm">Carregando...</div>
              ) : queues.length === 0 ? (
                <div className="py-10 text-center text-muted text-sm">
                  Nenhuma fila criada. Crie filas dentro do painel de controle de cada live.
                </div>
              ) : (
                <div className="bg-surface border border-border rounded-xl overflow-hidden divide-y divide-border/50">
                  {queues.map(q => (
                    <div key={q.id} className="flex items-center gap-3 px-4 py-3 hover:bg-surface2/40 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-medium">{q.name}</p>
                        <p className="text-xs text-muted mt-0.5">
                          {q.type === 'flash' ? '⚡ Flash' : '📋 Normal'} · {q.messages?.length ?? 0} mensagens · {q.default_delay_ms}ms
                        </p>
                      </div>
                      <button
                        onClick={() => removeQueue(q.id)}
                        className="text-muted/40 hover:text-danger text-xs transition-colors px-1"
                        title="Remover"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── PALAVRAS BANIDAS ──────────────────────────────────── */}
          {section === 'banned' && (
            <div className="space-y-4 max-w-2xl">
              <p className="text-muted text-sm">Mensagens dos viewers que contenham estas palavras serão bloqueadas automaticamente.</p>

              {/* Add form */}
              <div className="bg-surface border border-border rounded-xl p-4">
                <label className="block text-xs text-muted mb-2">Adicionar palavra</label>
                <div className="flex gap-2">
                  <input
                    value={newWord}
                    onChange={e => setNewWord(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addBannedWord()}
                    placeholder="Ex: spam, xingamento..."
                    className="flex-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-muted focus:outline-none focus:border-accent"
                  />
                  <button
                    onClick={addBannedWord}
                    disabled={addingWord || !newWord.trim()}
                    className="bg-danger/80 hover:bg-danger disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg transition-colors font-medium"
                  >
                    {addingWord ? '...' : 'Banir'}
                  </button>
                </div>
              </div>

              {/* List */}
              {loading ? (
                <div className="py-10 text-center text-muted text-sm">Carregando...</div>
              ) : banned.length === 0 ? (
                <div className="py-10 text-center text-muted text-sm">Nenhuma palavra banida.</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {banned.map(word => (
                    <div key={word} className="flex items-center gap-1.5 bg-danger/10 border border-danger/20 text-danger text-xs px-3 py-1.5 rounded-full">
                      <span>{word}</span>
                      <button onClick={() => removeBannedWord(word)} className="text-danger/60 hover:text-danger transition-colors ml-1">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </main>

      {openLeadId && (
        <LeadTimelineModal
          leadId={openLeadId}
          onClose={() => setOpenLeadId(null)}
          onConverted={() => loadLeads(leadsFilter)}
        />
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon, highlight, small }: {
  label: string; value: any; sub: string; icon: string
  highlight?: boolean; small?: boolean
}) {
  return (
    <div className={`bg-surface border rounded-xl p-4 ${highlight ? 'border-success/40' : 'border-border'}`}>
      <div className="flex items-start justify-between">
        <p className="text-xs text-muted">{label}</p>
        <span className="text-lg">{icon}</span>
      </div>
      <p className={`font-bold mt-1 ${small ? 'text-xl' : 'text-2xl'} ${highlight ? 'text-success' : 'text-white'}`}>{value}</p>
      <p className="text-xs text-muted/70 mt-0.5">{sub}</p>
    </div>
  )
}

function LiveRow({ live, currentUserId, onEnd, onDelete }: { live: Live; currentUserId?: string; onEnd?: (id: string) => void; onDelete?: (id: string) => void }) {
  const [ending,   setEnding]   = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleEnd() {
    if (!confirm(`Encerrar "${live.title}"?`)) return
    setEnding(true)
    try {
      await lives.end(live.id)
      onEnd?.(live.id)
    } catch (e: any) { alert(e.message) }
    finally { setEnding(false) }
  }

  async function handleDelete() {
    if (!confirm(`Apagar "${live.title}" permanentemente? Isso remove todos os dados da live.`)) return
    setDeleting(true)
    try {
      await lives.delete(live.id)
      onDelete?.(live.id)
    } catch (e: any) { alert(e.message) }
    finally { setDeleting(false) }
  }

  return (
    <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 hover:bg-surface2/40 transition-colors">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className={`shrink-0 text-xs font-semibold px-2.5 py-0.5 rounded-full border ${STATUS_STYLE[live.status]}`}>
          {STATUS_LABEL[live.status]}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate flex items-center gap-2">
            {live.title}
            {live.user_name && currentUserId && live.user_id !== currentUserId && (
              <span className="text-[10px] font-semibold bg-accent/15 text-accent px-1.5 py-0.5 rounded" title={`Live criada por ${live.user_name}`}>
                de {live.user_name}
              </span>
            )}
          </p>
          <p className="text-muted text-xs mt-0.5">
            {live.created_at && format(new Date(live.created_at), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 flex-wrap">
        <Link href={`/admin/${live.id}`} className="text-xs bg-accent/20 hover:bg-accent/30 text-accent px-3 py-1.5 rounded-lg transition-colors font-medium">Controlar</Link>
        <Link href={`/live/${live.short_id ?? live.id}`} target="_blank" className="text-xs bg-surface2 hover:bg-border text-muted px-3 py-1.5 rounded-lg transition-colors">Ver ↗</Link>
        {live.status !== 'ended' && (
          <button onClick={handleEnd} disabled={ending}
            className="text-xs bg-danger/15 hover:bg-danger/30 text-danger px-3 py-1.5 rounded-lg transition-colors font-medium disabled:opacity-40">
            {ending ? '...' : '■ Encerrar'}
          </button>
        )}
        <button onClick={handleDelete} disabled={deleting}
          className="text-xs text-muted/40 hover:text-danger hover:bg-danger/10 px-2 py-1.5 rounded-lg transition-colors disabled:opacity-40"
          title="Apagar live permanentemente">
          {deleting ? '...' : '🗑'}
        </button>
      </div>
    </div>
  )
}
