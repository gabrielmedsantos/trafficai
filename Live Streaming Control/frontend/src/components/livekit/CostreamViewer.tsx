'use client'
import { useState, useEffect } from 'react'
import clsx from 'clsx'
import { costream } from '@/lib/costream-api'
import type { CostreamInfo } from '@/lib/costream-api'
import HLSPlayer from './HLSPlayer'

interface CostreamViewerProps {
  liveId: string
}

export default function CostreamViewer({ liveId }: CostreamViewerProps) {
  const [costreamInfo, setCostreamInfo] = useState<CostreamInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const info = await costream.getInfo(liveId)
        setCostreamInfo(info)
        setError(null)
      } catch (err) {
        console.error('Failed to load costream info:', err)
        setError(String(err))
      } finally {
        setLoading(false)
      }
    }

    fetchInfo()
    const interval = setInterval(fetchInfo, 5000)
    return () => clearInterval(interval)
  }, [liveId])

  if (loading) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-black/80">
        <div className="text-center">
          <div className="animate-spin text-2xl mb-2">⏳</div>
          <div className="text-white/60 text-sm">Carregando transmissão...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-black/80">
        <div className="text-center">
          <div className="text-2xl mb-2">⚠️</div>
          <div className="text-white/60 text-sm">{error}</div>
        </div>
      </div>
    )
  }

  if (!costreamInfo) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-black/80">
        <div className="text-center">
          <div className="text-2xl mb-2">❌</div>
          <div className="text-white/60 text-sm">Co-streaming não disponível</div>
        </div>
      </div>
    )
  }

  const { traders, composition } = costreamInfo
  const isCompositing = composition.status === 'composing' && composition.hlsUrl

  return (
    <div className="relative w-full h-full bg-black flex flex-col">
      {/* Main HLS stream */}
      <div className="flex-1 relative overflow-hidden">
        {isCompositing ? (
          <>
            <HLSPlayer streamKey={composition.hlsUrl!} />
            {/* Status badge */}
            <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/70 px-3 py-2 rounded text-xs text-white">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="font-semibold">LIVE</span>
              <span className="text-white/60">•</span>
              <span className="text-white/60">{composition.layout}</span>
            </div>

            {/* Traders info */}
            <div className="absolute bottom-3 left-3 flex gap-2">
              {traders.map(trader => (
                <div
                  key={trader.position}
                  className={clsx(
                    'flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium',
                    trader.status === 'active'
                      ? 'bg-green-600/70 text-white'
                      : 'bg-yellow-600/70 text-white'
                  )}
                >
                  <span>Trader {trader.position}</span>
                  <span>{trader.micEnabled ? '🎙️' : '🔇'}</span>
                  <span>{trader.camEnabled ? '📷' : '❌'}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-black/80 text-white/60">
            <div className="text-3xl mb-4">⏸️</div>
            <div className="text-lg font-medium">Transmissão não iniciada</div>
            {traders.length === 2 ? (
              <div className="text-sm text-white/40 mt-2">
                Traders {traders.map(t => t.position).join(' e ')} conectados
              </div>
            ) : (
              <div className="text-sm text-white/40 mt-2">
                Aguardando traders... ({traders.length}/2)
              </div>
            )}
          </div>
        )}
      </div>

      {/* Info footer */}
      {isCompositing && (
        <div className="shrink-0 bg-black/90 border-t border-white/10 px-4 py-3">
          <div className="flex items-center justify-between text-xs text-white/70">
            <div className="flex gap-4">
              <div>Layout: <span className="text-white font-semibold">{composition.layout}</span></div>
              <div>Traders: <span className="text-white font-semibold">{traders.length}/2</span></div>
            </div>
            <div className="text-right">
              <div className="text-white/40">Co-streaming em tempo real</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
