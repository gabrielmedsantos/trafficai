'use client'
import { useEffect, useState } from 'react'
import { admin } from '@/lib/api'
import type { MessageQueue } from '@/types'
import clsx from 'clsx'

interface Props {
  liveId: string
}

type QueueStatus = 'idle' | 'running' | 'paused'

export default function QueueControl({ liveId }: Props) {
  const [queues, setQueues]         = useState<MessageQueue[]>([])
  const [activeId, setActiveId]     = useState<string | null>(null)
  const [status, setStatus]         = useState<QueueStatus>('idle')
  const [creating, setCreating]     = useState(false)
  const [loading, setLoading]       = useState(false)

  // Form state for new queue
  const [form, setForm] = useState({
    name:             '',
    type:             'flash' as 'normal' | 'flash',
    default_delay_ms: 300,
    messages:         [''],
  })

  useEffect(() => {
    loadQueues()
    pollStatus()
  }, [])

  async function loadQueues() {
    try { setQueues(await admin.listQueues()) } catch {}
  }

  async function pollStatus() {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/admin/lives/${liveId}/queue/status`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      )
      const d = await res.json()
      setStatus(d.status ?? 'idle')
    } catch {}
    setTimeout(pollStatus, 3000)
  }

  async function fire(queueId: string) {
    setLoading(true)
    try {
      await admin.startQueue(liveId, queueId)
      setActiveId(queueId)
      setStatus('running')
    } catch (err: any) { alert(err.message) }
    finally { setLoading(false) }
  }

  async function pause()  { await admin.pauseQueue(liveId);  setStatus('paused') }
  async function resume() { await admin.resumeQueue(liveId); setStatus('running') }
  async function stop()   { await admin.stopQueue(liveId);   setStatus('idle'); setActiveId(null) }

  async function deleteQueue(id: string) {
    if (!confirm('Deletar esta fila?')) return
    await admin.deleteQueue(id)
    setQueues((q) => q.filter((x) => x.id !== id))
    if (activeId === id) { await admin.stopQueue(liveId); setStatus('idle'); setActiveId(null) }
  }

  async function saveQueue(e: React.FormEvent) {
    e.preventDefault()
    const msgs = form.messages.filter((m) => m.trim())
    if (!form.name.trim() || msgs.length === 0) return
    setLoading(true)
    try {
      await admin.createQueue({
        name:             form.name.trim(),
        type:             form.type,
        default_delay_ms: form.default_delay_ms,
        messages:         msgs.map((text) => ({ text })),
      })
      await loadQueues()
      setForm({ name: '', type: 'flash', default_delay_ms: 300, messages: [''] })
      setCreating(false)
    } catch (err: any) { alert(err.message) }
    finally { setLoading(false) }
  }

  function addMsgLine()     { setForm((f) => ({ ...f, messages: [...f.messages, ''] })) }
  function removeMsgLine(i: number) { setForm((f) => ({ ...f, messages: f.messages.filter((_, j) => j !== i) })) }
  function setMsgLine(i: number, v: string) {
    setForm((f) => { const m = [...f.messages]; m[i] = v; return { ...f, messages: m } })
  }

  const statusDot   = { idle: 'bg-muted', running: 'bg-success pulse-live', paused: 'bg-warning' }
  const statusLabel = { idle: 'Parado', running: 'Rodando', paused: 'Pausado' }

  const flashQueues  = queues.filter((q) => q.type === 'flash')
  const normalQueues = queues.filter((q) => q.type !== 'flash')

  return (
    <div className="bg-surface p-2 space-y-2 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Filas de Mensagens</h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${statusDot[status]}`} />
            <span className="text-xs text-muted">{statusLabel[status]}</span>
          </div>
          <button
            onClick={() => setCreating((c) => !c)}
            className={clsx(
              'text-xs px-2.5 py-1 rounded-lg transition-colors font-medium',
              creating
                ? 'bg-surface2 text-muted hover:text-white'
                : 'bg-accent/20 text-accent hover:bg-accent/30'
            )}
          >
            {creating ? '✕ Fechar' : '+ Nova fila'}
          </button>
        </div>
      </div>

      {/* Active queue controls */}
      {status !== 'idle' && (
        <div className="flex gap-2">
          {status === 'running' && (
            <button onClick={pause} className="flex-1 bg-warning/20 hover:bg-warning/30 text-warning text-xs font-medium py-1.5 rounded-lg transition-colors">
              ⏸ Pausar
            </button>
          )}
          {status === 'paused' && (
            <button onClick={resume} className="flex-1 bg-success/20 hover:bg-success/30 text-success text-xs font-medium py-1.5 rounded-lg transition-colors">
              ▶ Continuar
            </button>
          )}
          <button onClick={stop} className="bg-danger/20 hover:bg-danger/30 text-danger text-xs font-medium px-4 py-1.5 rounded-lg transition-colors">
            ■ Parar
          </button>
        </div>
      )}

      {/* Flash queues */}
      {flashQueues.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted font-semibold uppercase tracking-wide">⚡ Flash</p>
          {flashQueues.map((q) => (
            <QueueRow
              key={q.id}
              queue={q}
              isActive={activeId === q.id && status !== 'idle'}
              loading={loading}
              onFire={() => fire(q.id)}
              onDelete={() => deleteQueue(q.id)}
            />
          ))}
        </div>
      )}

      {/* Normal queues */}
      {normalQueues.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted font-semibold uppercase tracking-wide">Normal</p>
          {normalQueues.map((q) => (
            <QueueRow
              key={q.id}
              queue={q}
              isActive={activeId === q.id && status !== 'idle'}
              loading={loading}
              onFire={() => fire(q.id)}
              onDelete={() => deleteQueue(q.id)}
            />
          ))}
        </div>
      )}

      {queues.length === 0 && !creating && (
        <p className="text-xs text-muted text-center py-3">
          Nenhuma fila criada. Clique em "Nova fila" para criar.
        </p>
      )}

      {/* Create queue form */}
      {creating && (
        <form onSubmit={saveQueue} className="border border-border rounded-lg p-3 space-y-3 bg-surface2/40">
          <p className="text-xs font-semibold text-white">Nova fila</p>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-muted mb-1">Nome</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Engajamento #G4"
                required
                className="w-full bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-white placeholder-muted focus:outline-none focus:border-accent transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Tipo</label>
              <select
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as 'normal' | 'flash' }))}
                className="w-full bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent transition-colors"
              >
                <option value="flash">⚡ Flash (urgência)</option>
                <option value="normal">Normal (cadenciado)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-muted mb-1">
              Intervalo entre msgs (ms)
            </label>
            <input
              type="number"
              value={form.default_delay_ms}
              onChange={(e) => setForm((f) => ({ ...f, default_delay_ms: Number(e.target.value) }))}
              min={100}
              max={60000}
              step={100}
              className="w-full bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs text-muted">Mensagens</label>
            {form.messages.map((msg, i) => (
              <div key={i} className="flex gap-1.5">
                <input
                  value={msg}
                  onChange={(e) => setMsgLine(i, e.target.value)}
                  placeholder={`Mensagem ${i + 1}...`}
                  className="flex-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-white placeholder-muted focus:outline-none focus:border-accent transition-colors"
                />
                {form.messages.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeMsgLine(i)}
                    className="text-danger/70 hover:text-danger px-2 text-xs transition-colors"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addMsgLine}
              className="text-xs text-accent hover:text-accent/80 transition-colors"
            >
              + Adicionar mensagem
            </button>
          </div>

          <button
            type="submit"
            disabled={loading || !form.name.trim() || form.messages.every((m) => !m.trim())}
            className="w-full bg-accent hover:bg-accent/90 disabled:opacity-40 text-white text-xs font-semibold py-2 rounded-lg transition-colors"
          >
            {loading ? 'Salvando...' : 'Salvar fila'}
          </button>
        </form>
      )}
    </div>
  )
}

function QueueRow({
  queue, isActive, loading, onFire, onDelete,
}: {
  queue: MessageQueue
  isActive: boolean
  loading: boolean
  onFire: () => void
  onDelete: () => void
}) {
  const isFlash = queue.type === 'flash'
  return (
    <div className={clsx(
      'flex items-center gap-2 rounded-lg px-3 py-2 border transition-colors',
      isActive
        ? 'border-success/40 bg-success/10'
        : 'border-border bg-surface2/40'
    )}>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-white truncate">{queue.name}</p>
        <p className="text-xs text-muted">{queue.messages.length} msgs · {queue.default_delay_ms}ms</p>
      </div>
      <button
        onClick={onFire}
        disabled={loading || isActive}
        className={clsx(
          'text-xs font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 shrink-0',
          isFlash
            ? 'bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400'
            : 'bg-success/20 hover:bg-success/30 text-success'
        )}
      >
        {isActive ? '▶ Rodando' : isFlash ? '⚡ Disparar' : '▶ Iniciar'}
      </button>
      <button
        onClick={onDelete}
        className="text-muted hover:text-danger text-xs px-1.5 transition-colors shrink-0"
        title="Deletar"
      >
        ✕
      </button>
    </div>
  )
}
