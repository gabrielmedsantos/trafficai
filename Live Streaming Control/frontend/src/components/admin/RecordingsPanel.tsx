'use client'
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { recordings } from '@/lib/recordings-api'
import type { Recording } from '@/lib/recordings-api'

interface RecordingsPanelProps {
  liveId: string
}

export default function RecordingsPanel({ liveId }: RecordingsPanelProps) {
  const [recordingsList, setRecordingsList] = useState<Recording[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch recordings (auto-refresh every 5s)
  useEffect(() => {
    const fetchRecordings = async () => {
      try {
        const result = await recordings.list(liveId)
        setRecordingsList(result.recordings)
        setError(null)
      } catch (err) {
        console.error('Failed to fetch recordings:', err)
        setError(String(err))
      } finally {
        setLoading(false)
      }
    }

    fetchRecordings()
    const interval = setInterval(fetchRecordings, 5000)
    return () => clearInterval(interval)
  }, [liveId])

  async function deleteRecording(recordingId: string) {
    if (!confirm('Delete this recording?')) return

    try {
      await recordings.delete(recordingId)
      const result = await recordings.list(liveId)
      setRecordingsList(result.recordings)
    } catch (err) {
      console.error('Failed to delete recording:', err)
      setError(String(err))
    }
  }

  const completedRecordings = recordingsList.filter(r => r.status === 'completed')
  const failedRecordings = recordingsList.filter(r => r.status === 'failed')

  return (
    <div className="bg-surface border border-border rounded-lg p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-white">🎥 Gravações</span>
        <span className="text-xs text-green-400">(automático)</span>
        {recordingsList.some(r => r.status === 'recording') && (
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="text-xs bg-red-900/30 border border-red-600/50 text-red-200 p-2 rounded">
          {error}
        </div>
      )}

      {/* Completed recordings */}
      {completedRecordings.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-green-400">✅ Gravadas ({completedRecordings.length})</div>
          <div className="space-y-1.5">
            {completedRecordings.map(rec => (
              <div key={rec.id} className="flex items-center justify-between bg-surface2 p-2 rounded text-xs">
                <div className="flex-1 min-w-0">
                  <div className="truncate text-white font-mono">{rec.file_path?.split('/').pop()}</div>
                  <div className="text-white/60">
                    {rec.file_size_bytes ? `${(rec.file_size_bytes / 1024 / 1024).toFixed(1)} MB` : '—'} •{' '}
                    {rec.started_at ? new Date(rec.started_at).toLocaleTimeString() : '—'}
                  </div>
                </div>
                <button
                  onClick={() => deleteRecording(rec.id)}
                  className="shrink-0 px-2 py-1 text-xs bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded transition-colors"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Failed recordings */}
      {failedRecordings.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-red-400">❌ Falhas ({failedRecordings.length})</div>
          <div className="space-y-1">
            {failedRecordings.map(rec => (
              <div key={rec.id} className="text-xs text-red-300 bg-red-900/20 p-1.5 rounded">
                {rec.error_message || 'Unknown error'}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status */}
      {!loading && recordingsList.length === 0 && (
        <div className="text-xs text-white/60 text-center py-2">Nenhuma gravação ainda</div>
      )}
    </div>
  )
}
