/**
 * Recordings API wrapper
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('token')
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error ?? `HTTP ${res.status}`)
  }

  return res.json()
}

export interface Recording {
  id: string
  live_id: string
  status: 'recording' | 'completed' | 'failed' | 'archived'
  format: 'mp4' | 'hls' | 'mkv'
  file_path: string
  file_size_bytes: number | null
  duration_seconds: number | null
  started_at: string
  completed_at: string | null
  metadata: Record<string, any>
  is_active?: boolean
}

export const recordings = {
  /**
   * Start recording a live
   */
  async start(liveId: string, recordingType: 'costream' | 'standard' | 'hybrid' = 'standard') {
    return request<{ ok: boolean; recording: any }>(
      `/recordings/${liveId}/start`,
      {
        method: 'POST',
        body: JSON.stringify({ recording_type: recordingType }),
      }
    )
  },

  /**
   * Stop recording a live
   */
  async stop(liveId: string) {
    return request<{ ok: boolean; recordingId: string }>(
      `/recordings/${liveId}/stop`,
      { method: 'POST' }
    )
  },

  /**
   * List all recordings for a live (public endpoint)
   */
  async list(liveId: string): Promise<{ liveId: string; recordings: Recording[] }> {
    return request(`/recordings/${liveId}`)
  },

  /**
   * Get recording info
   */
  async getInfo(recordingId: string): Promise<Recording> {
    return request(`/recordings/${recordingId}/info`)
  },

  /**
   * Delete a recording
   */
  async delete(recordingId: string) {
    return request<{ ok: boolean }>(`/recordings/${recordingId}`, {
      method: 'DELETE',
    })
  },

  /**
   * Archive recording to cold storage
   */
  async archive(recordingId: string, archivePath: string) {
    return request<{ ok: boolean }>(
      `/recordings/${recordingId}/archive`,
      {
        method: 'POST',
        body: JSON.stringify({ archive_path: archivePath }),
      }
    )
  },
}
