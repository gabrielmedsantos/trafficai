/**
 * Co-streaming API wrapper
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

// ─── Costream types ────────────────────────────────────────────────────────────

export interface CostreamInfo {
  liveId: string
  mode: 'costream'
  traders: Array<{
    position: 'A' | 'B'
    userId: string
    status: string
    micEnabled: boolean
    camEnabled: boolean
  }>
  composition: {
    status: 'idle' | 'composing' | 'error'
    layout: 'split-50-50' | 'pbp-main-pip' | 'pip-main-pip'
    hlsUrl: string | null
  }
}

export interface TraderToken {
  token: string
  url: string
  room: string
  identity: string
  position: 'A' | 'B'
}

export interface CostreamCreatePayload {
  ok: boolean
  costream: {
    liveId: string
    mode: 'costream'
    trader_a_id: string
    trader_b_id: string
    layout: string
  }
}

// ─── API calls ────────────────────────────────────────────────────────────────

export const costream = {
  /**
   * Create costream: Trader A invites Trader B
   */
  async create(
    liveId: string,
    traderId: string,
    layout: 'split-50-50' | 'pbp-main-pip' | 'pip-main-pip' = 'split-50-50'
  ): Promise<CostreamCreatePayload> {
    return request(`/costream/${liveId}/create`, {
      method: 'POST',
      body: JSON.stringify({
        trader_b_id: traderId,
        layout,
      }),
    })
  },

  /**
   * Get trader JWT token
   */
  async getToken(
    liveId: string,
    position: 'A' | 'B',
    name?: string
  ): Promise<TraderToken> {
    return request(`/costream/${liveId}/trader-token`, {
      method: 'POST',
      body: JSON.stringify({
        position,
        name,
      }),
    })
  },

  /**
   * Start FFmpeg compositor
   */
  async startComposition(liveId: string) {
    return request<{ ok: boolean; hlsUrl: string; layout: string }>(
      `/costream/${liveId}/start-composition`,
      { method: 'POST' }
    )
  },

  /**
   * Stop FFmpeg compositor
   */
  async stopComposition(liveId: string) {
    return request<{ ok: boolean }>(`/costream/${liveId}/stop-composition`, {
      method: 'POST',
    })
  },

  /**
   * Change layout
   */
  async changeLayout(liveId: string, layout: 'split-50-50' | 'pbp-main-pip' | 'pip-main-pip') {
    return request<{ ok: boolean; layout: string; message: string }>(
      `/costream/${liveId}/layout`,
      {
        method: 'PATCH',
        body: JSON.stringify({ layout }),
      }
    )
  },

  /**
   * Get costream info (public)
   */
  async getInfo(liveId: string): Promise<CostreamInfo> {
    return request(`/costream/${liveId}/info`)
  },

  /**
   * Control trader mic/cam
   */
  async controlTrader(
    liveId: string,
    position: 'A' | 'B',
    control: { mic_enabled?: boolean; cam_enabled?: boolean }
  ) {
    return request<{ ok: boolean }>(
      `/costream/${liveId}/trader/${position}/control`,
      {
        method: 'PATCH',
        body: JSON.stringify(control),
      }
    )
  },
}
