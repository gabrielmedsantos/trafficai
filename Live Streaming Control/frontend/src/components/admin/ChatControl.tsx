'use client'
import { useEffect, useState } from 'react'
import { admin } from '@/lib/api'
import type { Persona } from '@/types'
import clsx from 'clsx'

interface Props {
  liveId:    string
  personas:  Persona[]
  onPersonaUpdated?: (updated: Persona) => void
}

type Mode = 'manual' | 'multi' | 'flash' | 'admin'

export default function ChatControl({ liveId, personas, onPersonaUpdated }: Props) {
  const [mode, setMode]           = useState<Mode>('manual')
  const [content, setContent]     = useState('')
  const [personaId, setPersonaId] = useState<string>('')

  // Multi-bot state
  const [multiMessages, setMultiMessages] = useState('')   // textarea — one message per line
  const [botCount, setBotCount]           = useState(10)
  const [botInterval, setBotInterval]     = useState(800)
  const [useFavorites, setUseFavorites]   = useState(false)
  const [personasOpen, setPersonasOpen]  = useState(false)
  const [personaSearch, setPersonaSearch] = useState('')

  // Flash state
  const [flashMsg, setFlashMsg]           = useState('')
  const [flashCount, setFlashCount]       = useState(20)
  const [flashInterval, setFlashInterval] = useState(300)

  const [loading, setLoading]  = useState(false)
  const [sent, setSent]        = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Bot activity (poll every 2s while mounted) — used to highlight the "Parar bots" button
  const [botActivity, setBotActivity] = useState<{ sends: number; queue: boolean }>({ sends: 0, queue: false })
  const [cancelingBots, setCancelingBots] = useState(false)
  useEffect(() => {
    let stop = false
    async function poll() {
      try {
        const a = await admin.botActivity(liveId)
        if (!stop) setBotActivity(a)
      } catch { /* endpoint may not exist on older backends */ }
    }
    poll()
    const id = setInterval(poll, 2000)
    return () => { stop = true; clearInterval(id) }
  }, [liveId])

  const botsRunning = botActivity.sends > 0 || botActivity.queue

  async function handleCancelBots() {
    if (cancelingBots) return
    setCancelingBots(true)
    try {
      const { canceled } = await admin.cancelBots(liveId)
      setBotActivity({ sends: 0, queue: false })
      if (canceled > 0) flash_ok()
    } catch (err: any) { alert(err.message) }
    finally { setCancelingBots(false) }
  }

  function flash_ok() { setSent(true); setTimeout(() => setSent(false), 1500) }

  async function sendManual() {
    if (!content.trim()) return
    setLoading(true)
    try {
      await admin.sendChat(liveId, {
        content,
        persona_id: personaId || undefined,
        type: mode === 'admin' ? 'admin' : 'fake',
      })
      setContent('')
      flash_ok()
    } catch (err: any) { alert(err.message) }
    finally { setLoading(false) }
  }

  async function sendMulti() {
    const lines = multiMessages.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length === 0) return
    setLoading(true)
    try {
      await admin.multiSend(liveId, {
        messages:      lines,
        count:         botCount,
        interval_ms:   botInterval,
        use_favorites: useFavorites,
      })
      flash_ok()
    } catch (err: any) { alert(err.message) }
    finally { setLoading(false) }
  }

  async function sendFlash() {
    if (!flashMsg.trim()) return
    setLoading(true)
    try {
      await admin.flashChat(liveId, {
        messages:    [flashMsg],
        count:       flashCount,
        interval_ms: flashInterval,
      })
      flash_ok()
    } catch (err: any) { alert(err.message) }
    finally { setLoading(false) }
  }

  async function toggleFavorite(p: Persona) {
    setTogglingId(p.id)
    try {
      const updated = await admin.updatePersona(p.id, { is_favorite: !p.is_favorite })
      onPersonaUpdated?.(updated)
    } catch (err: any) { alert(err.message) }
    finally { setTogglingId(null) }
  }

  const favorites = personas.filter(p => p.is_favorite)
  const multiLines = multiMessages.split('\n').map(l => l.trim()).filter(Boolean)

  const MODES: { id: Mode; label: string }[] = [
    { id: 'manual', label: 'Manual' },
    { id: 'multi',  label: '👥 Multi-bot' },
    { id: 'flash',  label: '⚡ Flash' },
    { id: 'admin',  label: '📢 Admin' },
  ]

  return (
    <div className="bg-surface p-2 space-y-2 flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-sm">Controle de Chat</h3>
        <button
          onClick={handleCancelBots}
          disabled={cancelingBots}
          title={botsRunning ? 'Para imediatamente todos os envios de bots em andamento' : 'Nenhum envio em andamento (seguro clicar)'}
          className={clsx(
            'text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5',
            botsRunning
              ? 'bg-danger/20 hover:bg-danger/30 text-danger border border-danger/40 animate-pulse'
              : 'bg-surface2 hover:bg-surface2/80 text-muted border border-border'
          )}
        >
          {botsRunning && <span className="w-1.5 h-1.5 rounded-full bg-danger" />}
          {cancelingBots ? '...' : botsRunning ? `⏹ Parar bots (${botActivity.sends})` : '⏹ Parar bots'}
        </button>
      </div>

      {/* Mode tabs */}
      <div className="flex bg-surface2 rounded-lg p-1 gap-1">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={clsx(
              'flex-1 py-1.5 rounded-md text-xs font-medium transition-colors',
              mode === m.id ? 'bg-accent text-white' : 'text-muted hover:text-white'
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Manual */}
      {mode === 'manual' && (
        <div className="space-y-3">
          {personas.length > 0 && (
            <div>
              <label className="block text-xs text-muted mb-1">Persona</label>
              <select value={personaId} onChange={e => setPersonaId(e.target.value)}
                className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent">
                <option value="">— Aleatório —</option>
                {personas.map(p => (
                  <option key={p.id} value={p.id}>{p.is_favorite ? '⭐ ' : ''}{p.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs text-muted mb-1">Mensagem</label>
            <div className="flex gap-2">
              <input value={content} onChange={e => setContent(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendManual()}
                placeholder="Mensagem do bot..."
                className="flex-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-muted focus:outline-none focus:border-accent" />
              <button onClick={sendManual} disabled={loading || !content.trim()}
                className={clsx('px-3 rounded-lg text-sm transition-colors font-medium disabled:opacity-40',
                  sent ? 'bg-success text-white' : 'bg-accent hover:bg-accent/90 text-white')}>
                {sent ? '✓' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Multi-bot */}
      {mode === 'multi' && (
        <div className="space-y-3">

          {/* Messages textarea */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-muted">Mensagens <span className="text-muted/60">(uma por linha — bots randomizam)</span></label>
              {multiLines.length > 0 && (
                <span className="text-xs text-accent">{multiLines.length} msg{multiLines.length > 1 ? 's' : ''}</span>
              )}
            </div>
            <textarea
              value={multiMessages}
              onChange={e => setMultiMessages(e.target.value)}
              rows={4}
              placeholder={"Que aula incrível! 🔥\nAinda dá tempo de entrar?\nIsso aqui vai mudar minha vida!"}
              className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-muted focus:outline-none focus:border-accent resize-none"
            />
          </div>

          {/* Count + interval */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-muted mb-1">Nº de bots</label>
              <input
                type="number"
                value={botCount}
                onChange={e => setBotCount(Math.max(1, Math.min(500, Number(e.target.value))))}
                min={1} max={500}
                className="w-full bg-surface2 border border-border rounded-lg px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Intervalo (ms)</label>
              <input
                type="number"
                value={botInterval}
                onChange={e => setBotInterval(Number(e.target.value))}
                min={50} max={10000} step={50}
                className="w-full bg-surface2 border border-border rounded-lg px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          {/* Personas / favorites — colapsável */}
          {personas.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <button
                  onClick={() => setPersonasOpen(v => !v)}
                  className="flex items-center gap-1.5 text-xs text-muted hover:text-white transition-colors"
                >
                  <svg className={clsx('w-3 h-3 transition-transform', personasOpen && 'rotate-90')} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg>
                  <span>Personas</span>
                  <span className="text-muted/60">({personas.length} total · {favorites.length} favorita{favorites.length !== 1 ? 's' : ''})</span>
                </button>
                <button
                  onClick={() => setUseFavorites(v => !v)}
                  className={clsx(
                    'text-xs px-2 py-0.5 rounded-full border transition-colors',
                    useFavorites
                      ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                      : 'border-border text-muted hover:text-white'
                  )}
                >
                  {useFavorites ? '⭐ Só favoritas' : '☆ Todas'}
                </button>
              </div>

              {personasOpen && (
                <>
                  {personas.length > 20 && (
                    <input
                      value={personaSearch}
                      onChange={e => setPersonaSearch(e.target.value)}
                      placeholder="Buscar persona..."
                      className="w-full bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-white placeholder-muted/50 mb-1.5 focus:outline-none focus:border-accent"
                    />
                  )}
                  <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto pr-1">
                    {personas
                      .filter(p => !personaSearch || p.name.toLowerCase().includes(personaSearch.toLowerCase()))
                      .map(p => (
                      <button
                        key={p.id}
                        onClick={() => toggleFavorite(p)}
                        disabled={togglingId === p.id}
                        title={p.is_favorite ? 'Remover dos favoritos' : 'Marcar como favorita'}
                        className={clsx(
                          'flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors disabled:opacity-50',
                          p.is_favorite
                            ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                            : 'border-border text-muted hover:text-white hover:border-border/80'
                        )}
                      >
                        <span>{p.is_favorite ? '⭐' : '☆'}</span>
                        <span>{p.name}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {useFavorites && favorites.length === 0 && (
                <p className="text-xs text-warning mt-1.5">Nenhuma persona favorita. Marque algumas acima ou desative o filtro.</p>
              )}
            </div>
          )}

          {personas.length === 0 && (
            <div className="text-xs text-warning bg-warning/10 border border-warning/20 rounded-lg px-3 py-2">
              Sem personas cadastradas. Os bots usarão nomes como "Bot1", "Bot2"...
            </div>
          )}

          <button
            onClick={sendMulti}
            disabled={loading || multiLines.length === 0}
            className={clsx('w-full py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-40',
              sent ? 'bg-success text-white' : 'bg-accent hover:bg-accent/90 text-white')}
          >
            {loading ? 'Enviando...' : sent ? `✓ ${botCount} bots enviaram!` : `👥 Enviar com ${botCount} bots`}
          </button>
        </div>
      )}

      {/* Flash */}
      {mode === 'flash' && (
        <div className="space-y-3">
          <p className="text-xs text-muted">Dispara uma rajada de mensagens em alta velocidade.</p>
          <div>
            <label className="block text-xs text-muted mb-1">Mensagem</label>
            <input value={flashMsg} onChange={e => setFlashMsg(e.target.value)}
              placeholder="#G4 #G4 #G4"
              className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-muted focus:outline-none focus:border-accent" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-muted mb-1">Quantidade</label>
              <input type="number" value={flashCount} onChange={e => setFlashCount(Number(e.target.value))}
                min={1} max={500}
                className="w-full bg-surface2 border border-border rounded-lg px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Intervalo (ms)</label>
              <input type="number" value={flashInterval} onChange={e => setFlashInterval(Number(e.target.value))}
                min={50} step={50}
                className="w-full bg-surface2 border border-border rounded-lg px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:border-accent" />
            </div>
          </div>
          <button onClick={sendFlash} disabled={loading || !flashMsg.trim()}
            className={clsx('w-full py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-40',
              sent ? 'bg-success text-white' : 'bg-warning hover:bg-warning/90 text-bg')}>
            {loading ? 'Disparando...' : sent ? '✓ Disparado!' : `⚡ Disparar ${flashCount}x`}
          </button>
        </div>
      )}

      {/* Admin message */}
      {mode === 'admin' && (
        <div className="space-y-3">
          <p className="text-xs text-orange-400/80">Mensagem destacada em laranja para todos os espectadores.</p>
          <div>
            <label className="block text-xs text-muted mb-1">Mensagem</label>
            <div className="flex gap-2">
              <input value={content} onChange={e => setContent(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendManual()}
                placeholder="Mensagem destacada..."
                className="flex-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-muted focus:outline-none focus:border-orange-400/60" />
              <button onClick={sendManual} disabled={loading || !content.trim()}
                className={clsx('px-3 rounded-lg text-sm transition-colors font-bold disabled:opacity-40',
                  sent ? 'bg-success text-white' : 'bg-orange-500 hover:bg-orange-500/90 text-white')}>
                {sent ? '✓' : '➤'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
