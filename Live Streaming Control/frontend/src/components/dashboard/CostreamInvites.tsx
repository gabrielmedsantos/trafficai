'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import clsx from 'clsx'
import { costreamInvites } from '@/lib/costream-invites-api'
import type { CostreamInvite } from '@/lib/costream-invites-api'

export default function CostreamInvites() {
  const [invites, setInvites] = useState<CostreamInvite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchInvites = async () => {
      try {
        const result = await costreamInvites.getPending()
        setInvites(result.invites || [])
        setError(null)
      } catch (err) {
        console.error('Failed to fetch costream invites:', err)
        setError(String(err))
      } finally {
        setLoading(false)
      }
    }

    fetchInvites()
    const interval = setInterval(fetchInvites, 10000) // Refresh every 10s
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="text-sm text-muted">Carregando convites...</div>
      </div>
    )
  }

  if (invites.length === 0) {
    return null // Don't show section if no invites
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          🎬 Convites para Co-streaming
          {invites.some(i => i.status === 'live') && (
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          )}
        </h2>
        <p className="text-xs text-muted mb-4">
          Você foi convidado para fazer co-streaming com estes traders
        </p>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-600/30 text-red-200 text-xs p-3 rounded">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {invites.map(invite => (
          <Link
            key={invite.id}
            href={invite.join_url}
            className="block"
          >
            <div className="bg-surface border border-border hover:border-accent/50 rounded-lg p-4 transition-colors cursor-pointer">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-white truncate">{invite.title}</h3>
                    <span className={clsx(
                      'px-2 py-0.5 rounded text-xs font-semibold shrink-0',
                      invite.status === 'live'
                        ? 'bg-red-600/30 text-red-200'
                        : invite.status === 'waiting'
                          ? 'bg-yellow-600/30 text-yellow-200'
                          : 'bg-gray-600/30 text-gray-200'
                    )}>
                      {invite.status === 'live' ? '🔴 LIVE' : invite.status === 'waiting' ? '⏳ Agendado' : '✅ Encerrado'}
                    </span>
                  </div>
                  <p className="text-xs text-muted">
                    Convidado por: <span className="text-accent">{invite.trader_a_name}</span>
                  </p>
                  <p className="text-xs text-muted/60 mt-1">
                    {new Date(invite.created_at).toLocaleDateString('pt-BR', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>

                <button
                  className={clsx(
                    'px-4 py-2 rounded-lg text-sm font-medium transition-all shrink-0',
                    invite.status === 'live'
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-accent hover:bg-accent/90 text-white'
                  )}
                  onClick={(e) => {
                    e.preventDefault()
                    window.location.href = invite.join_url
                  }}
                >
                  {invite.status === 'live' ? '▶️ Entrar Agora' : '⏳ Visualizar'}
                </button>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
