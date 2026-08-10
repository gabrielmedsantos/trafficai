/**
 * Co-streaming Invites API wrapper
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

export interface CostreamInvite {
  id: string
  short_id: string
  title: string
  status: 'waiting' | 'live' | 'ended'
  trader_a_name: string
  created_at: string
  scheduled_at?: string
  join_url: string
}

export const costreamInvites = {
  /**
   * Get pending costream invites for current user
   */
  async getPending(): Promise<{ ok: boolean; invites: CostreamInvite[] }> {
    return request('/costream/invites/pending')
  },

  /**
   * Get invite details
   */
  async getInfo(liveId: string): Promise<{ ok: boolean; invite: CostreamInvite }> {
    return request(`/costream/invites/${liveId}/info`)
  },

  /**
   * Check if user can join a live
   */
  async canJoin(liveId: string): Promise<{ position: 'A' | 'B' | null; can_join: boolean }> {
    return request(`/costream/live/${liveId}/can-join`)
  },
}
