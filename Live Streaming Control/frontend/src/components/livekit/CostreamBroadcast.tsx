'use client'
import {
  LiveKitRoom,
  useLocalParticipant,
  useParticipants,
  useTracks,
  useRoomContext,
  ParticipantTile,
} from '@livekit/components-react'
import { Track, RoomEvent } from 'livekit-client'
import { useState, useEffect, useRef, useCallback } from 'react'
import clsx from 'clsx'
import { costream } from '@/lib/costream-api'
import type { CostreamInfo } from '@/lib/costream-api'
import HLSPlayer from './HLSPlayer'

type CostreamLayout = 'split-50-50' | 'pbp-main-pip' | 'pip-main-pip'

interface CostreamBroadcastProps {
  liveId: string
  position: 'A' | 'B'
  onLeave: () => void
}

/**
 * Inner component that uses LiveKit context
 */
function CostreamBroadcastInner({ liveId, position, onLeave }: CostreamBroadcastProps) {
  const { localParticipant } = useLocalParticipant()
  const participants = useParticipants()
  const room = useRoomContext()

  // Costream state
  const [costreamInfo, setCostreamInfo] = useState<CostreamInfo | null>(null)
  const [layout, setLayout] = useState<CostreamLayout>('split-50-50')
  const [compositorRunning, setCompositorRunning] = useState(false)
  const [compositorStarting, setCompositorStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Media controls
  const [micOn, setMicOn] = useState(false)
  const [camOn, setCamOn] = useState(false)

  // Track if we already tried to start compositor
  const compositorStartedRef = useRef(false)

  // Fetch costream info periodically
  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const info = await costream.getInfo(liveId)
        setCostreamInfo(info)
        setLayout(info.composition.layout)
        setCompositorRunning(info.composition.status === 'composing')
        setError(null)
      } catch (err) {
        console.error('Failed to fetch costream info:', err)
        setError(String(err))
      }
    }

    fetchInfo()
    const interval = setInterval(fetchInfo, 3000)
    return () => clearInterval(interval)
  }, [liveId])

  // Enable mic/cam when room connects
  useEffect(() => {
    if (room.state === 'connected' && localParticipant) {
      ;(async () => {
        try {
          await localParticipant.setMicrophoneEnabled(true)
          await localParticipant.setCameraEnabled(true)
          setMicOn(true)
          setCamOn(true)
        } catch (err) {
          console.error('Failed to enable media:', err)
        }
      })()
    }
  }, [room.state, localParticipant])

  // Auto-start compositor when both traders present
  useEffect(() => {
    if (
      !compositorRunning &&
      !compositorStarting &&
      !compositorStartedRef.current &&
      participants.length >= 2
    ) {
      compositorStartedRef.current = true
      startCompositor()
    }
  }, [participants.length, compositorRunning, compositorStarting])

  async function startCompositor() {
    if (compositorStarting) return
    setCompositorStarting(true)
    try {
      const result = await costream.startComposition(liveId)
      setCompositorRunning(true)
      setError(null)
    } catch (err) {
      console.error('Failed to start compositor:', err)
      setError(String(err))
      compositorStartedRef.current = false
    } finally {
      setCompositorStarting(false)
    }
  }

  async function stopCompositor() {
    try {
      await costream.stopComposition(liveId)
      setCompositorRunning(false)
      compositorStartedRef.current = false
      setError(null)
    } catch (err) {
      console.error('Failed to stop compositor:', err)
      setError(String(err))
    }
  }

  async function changeLayout(newLayout: CostreamLayout) {
    if (newLayout === layout) return
    try {
      setLayout(newLayout)
      await costream.changeLayout(liveId, newLayout)

      // Stop and restart compositor with new layout
      if (compositorRunning) {
        await stopCompositor()
        await new Promise(r => setTimeout(r, 1000))
        setCompositorStarting(true)
        await startCompositor()
      }
      setError(null)
    } catch (err) {
      console.error('Failed to change layout:', err)
      setError(String(err))
      setLayout(layout) // revert
    }
  }

  async function toggleMic() {
    const next = !micOn
    try {
      setMicOn(next)
      await localParticipant?.setMicrophoneEnabled(next)
      await costream.controlTrader(liveId, position, { mic_enabled: next })
      setError(null)
    } catch (err) {
      console.error('Failed to toggle mic:', err)
      setError(String(err))
      setMicOn(!next) // revert
    }
  }

  async function toggleCam() {
    const next = !camOn
    try {
      setCamOn(next)
      await localParticipant?.setCameraEnabled(next)
      await costream.controlTrader(liveId, position, { cam_enabled: next })
      setError(null)
    } catch (err) {
      console.error('Failed to toggle cam:', err)
      setError(String(err))
      setCamOn(!next) // revert
    }
  }

  // Find other trader info
  const otherPosition = position === 'A' ? 'B' : 'A'
  const otherTrader = costreamInfo?.traders.find(t => t.position === otherPosition)

  // Find local participant for self preview
  const localTracks = localParticipant?.videoTrackPublications
  const localVideoTrack = Array.from(localTracks || []).find(pub => pub.track?.kind === Track.Source.Camera)

  return (
    <div className="flex flex-col h-full w-full bg-[#0d0f14]">
      {/* Main area: HLS player or preview */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Compositor output */}
        <div className="flex-1 flex flex-col relative bg-black">
          {compositorRunning && costreamInfo?.composition.hlsUrl ? (
            <>
              <HLSPlayer streamKey={costreamInfo.composition.hlsUrl} />
              <div className="absolute top-2 left-2 text-xs bg-green-600/80 text-white px-2 py-1 rounded">
                🔴 LIVE • {layout}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center bg-black/50 text-white/60 gap-3">
              {compositorStarting && (
                <>
                  <div className="animate-spin">⏳</div>
                  <div className="text-sm">Iniciando compositor...</div>
                </>
              )}
              {!compositorStarting && participants.length < 2 && (
                <>
                  <div className="text-2xl">⏸️</div>
                  <div className="text-sm">Aguardando Trader {otherPosition}...</div>
                  <div className="text-xs text-white/40">
                    {participants.length}/2 traders conectados
                  </div>
                </>
              )}
              {!compositorStarting && participants.length >= 2 && !compositorRunning && (
                <>
                  <div className="text-2xl">⚠️</div>
                  <div className="text-sm">Compositor aguardando início</div>
                  <button
                    onClick={startCompositor}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white text-sm"
                  >
                    Iniciar Transmissão
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Sidebar: previews + status */}
        <div className="shrink-0 w-80 bg-[#111318] flex flex-col gap-2 p-3 overflow-y-auto border-l border-white/10">
          {/* Self preview */}
          <div className="rounded-lg bg-[#1a1d28] overflow-hidden border border-white/20">
            <div className="text-xs text-white/60 bg-[#0d0f14] px-2 py-1.5 font-semibold">
              Você (Trader {position})
            </div>
            <div style={{ aspectRatio: '4/3', position: 'relative' }}>
              {localVideoTrack ? (
                <ParticipantTile
                  trackRef={localVideoTrack}
                  style={{ width: '100%', height: '100%' }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-700 text-white/40">
                  📷 Câmera
                </div>
              )}
            </div>
          </div>

          {/* Other trader preview */}
          {otherTrader ? (
            <div className="rounded-lg bg-[#1a1d28] overflow-hidden border border-white/20">
              <div className="text-xs text-white/60 bg-[#0d0f14] px-2 py-1.5 font-semibold flex items-center justify-between">
                <span>Trader {otherPosition}</span>
                <span
                  className={clsx(
                    'px-2 py-0.5 rounded text-xs',
                    otherTrader.status === 'active' ? 'bg-green-600/50 text-green-100' : 'bg-yellow-600/50 text-yellow-100'
                  )}
                >
                  {otherTrader.status === 'active' ? '🟢 Ativo' : '🟡 Pausado'}
                </span>
              </div>
              <div style={{ aspectRatio: '4/3' }}>
                <div className="w-full h-full flex flex-col items-center justify-center bg-gray-800 text-white/50 gap-2">
                  <div className="text-3xl">👤</div>
                  <div className="text-xs text-center">
                    {otherTrader.micEnabled ? '🎙️' : '🔇'} {otherTrader.camEnabled ? '📷' : '❌'}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-[#1a1d28] overflow-hidden border border-white/20">
              <div className="text-xs text-white/60 bg-[#0d0f14] px-2 py-1.5 font-semibold">
                Trader {otherPosition}
              </div>
              <div
                style={{ aspectRatio: '4/3' }}
                className="flex items-center justify-center bg-gray-900 text-white/30"
              >
                ⏳ Aguardando
              </div>
            </div>
          )}

          {/* Status indicator */}
          <div className="rounded-lg bg-[#1a1d28] p-3 border border-white/20">
            <div className="text-xs text-white/60 font-semibold mb-2">Status</div>
            <div className="space-y-1 text-xs text-white/70">
              <div>Compositor: {compositorRunning ? '🟢 Ativo' : '⚫ Inativo'}</div>
              <div>Participantes: {participants.length}/2</div>
              <div>Seu áudio: {micOn ? '🟢' : '🔴'}</div>
              <div>Sua câmera: {camOn ? '🟢' : '🔴'}</div>
            </div>
          </div>

          {/* Erro */}
          {error && (
            <div className="rounded-lg bg-red-900/30 border border-red-600/50 p-3">
              <div className="text-xs text-red-200 font-semibold mb-1">Erro</div>
              <div className="text-xs text-red-100">{error}</div>
            </div>
          )}
        </div>
      </div>

      {/* Layout selector */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-[#111318] border-t border-white/10">
        <span className="text-sm text-white/60">Layout:</span>
        <div className="flex gap-2">
          {(['split-50-50', 'pbp-main-pip', 'pip-main-pip'] as CostreamLayout[]).map(l => (
            <button
              key={l}
              onClick={() => changeLayout(l)}
              disabled={compositorStarting}
              className={clsx(
                'px-3 py-1.5 rounded text-xs font-medium transition-all disabled:opacity-50',
                layout === l
                  ? 'bg-blue-600 text-white'
                  : 'bg-white/10 hover:bg-white/20 text-white/70'
              )}
            >
              {l === 'split-50-50' ? '50/50' : l === 'pbp-main-pip' ? 'PBP' : 'PiP'}
            </button>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="shrink-0 flex items-center justify-center gap-3 px-5 py-4 bg-[#111318] border-t border-white/10">
        <button
          onClick={toggleMic}
          disabled={!room || room.state !== 'connected'}
          className={clsx(
            'w-12 h-12 rounded-full flex items-center justify-center text-lg transition-all disabled:opacity-50',
            micOn ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-red-600 hover:bg-red-700 text-white'
          )}
          title={micOn ? 'Mute mic' : 'Unmute mic'}
        >
          {micOn ? '🎙️' : '🔇'}
        </button>

        <button
          onClick={toggleCam}
          disabled={!room || room.state !== 'connected'}
          className={clsx(
            'w-12 h-12 rounded-full flex items-center justify-center text-lg transition-all disabled:opacity-50',
            camOn ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-red-600 hover:bg-red-700 text-white'
          )}
          title={camOn ? 'Turn off camera' : 'Turn on camera'}
        >
          {camOn ? '📷' : '❌'}
        </button>

        <div className="flex-1" />

        <button
          onClick={compositorRunning ? stopCompositor : startCompositor}
          disabled={participants.length < 2 || compositorStarting}
          className={clsx(
            'px-4 py-2 rounded text-sm font-medium transition-all disabled:opacity-50',
            compositorRunning
              ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
              : 'bg-green-600 hover:bg-green-700 text-white'
          )}
        >
          {compositorStarting ? '⏳ Iniciando...' : compositorRunning ? '⏸️ Parar' : '▶️ Iniciar'}
        </button>

        <button
          onClick={onLeave}
          className="w-12 h-12 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center text-white text-lg transition-all"
          title="Leave broadcast"
        >
          📵
        </button>
      </div>
    </div>
  )
}

/**
 * Wrapper component that fetches token and sets up LiveKit room
 */
export default function CostreamBroadcast(props: CostreamBroadcastProps) {
  const { liveId, position, onLeave } = props

  const [token, setToken] = useState<string | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [room, setRoom] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchToken = async () => {
      try {
        setLoading(true)
        const data = await costream.getToken(liveId, position, `Trader ${position}`)
        setToken(data.token)
        setUrl(data.url)
        setRoom(data.room)
        setError(null)
      } catch (err) {
        setError(String(err))
      } finally {
        setLoading(false)
      }
    }

    fetchToken()
  }, [liveId, position])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#0d0f14] text-white/60">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin text-2xl">⏳</div>
          <div className="text-sm">Conectando...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-[#0d0f14]">
        <div className="text-center">
          <div className="text-2xl mb-2">❌</div>
          <div className="text-white text-sm max-w-sm">{error}</div>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    )
  }

  if (!token || !url || !room) {
    return (
      <div className="flex items-center justify-center h-full bg-[#0d0f14] text-white/60">
        <div className="text-sm">Erro ao conectar</div>
      </div>
    )
  }

  return (
    <LiveKitRoom
      url={url}
      token={token}
      connect={true}
      options={{
        dynacastQuality: 'disabled',
        preferredCodecs: {
          audio: [],
          video: [{ codec: 'vp9' }, { codec: 'h264' }],
        },
      }}
    >
      <CostreamBroadcastInner {...props} />
    </LiveKitRoom>
  )
}
