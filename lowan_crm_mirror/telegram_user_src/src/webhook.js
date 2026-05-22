'use strict'
const fetch = require('node-fetch')
const pino = require('pino')

const logger = pino({ name: 'tg-user-webhook', level: process.env.LOG_LEVEL || 'info' })

const BASE_URL = process.env.WEBHOOK_BASE_URL || 'https://lowan.site'
const INTERNAL_TOKEN = process.env.INTERNAL_SHARED_SECRET || ''

async function postWebhook(connectionId, payload, attempt = 1) {
  if (!INTERNAL_TOKEN) {
    logger.warn('INTERNAL_SHARED_SECRET ausente — webhook bloqueado')
    return
  }
  // /webhooks/* é registrado no app.js sem prefix /api/v1 (linha `app.register(webhooks_routes_1, { prefix: '/webhooks' })`)
  const url = `${BASE_URL}/webhooks/telegram-user/${connectionId}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Token': INTERNAL_TOKEN },
      body: JSON.stringify(payload),
      timeout: 10000,
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`)
    }
    logger.debug({ connectionId, type: payload.type }, 'webhook posted')
  } catch (err) {
    if (attempt < 3) {
      const delay = Math.pow(2, attempt) * 1000
      setTimeout(() => postWebhook(connectionId, payload, attempt + 1).catch(() => {}), delay)
      logger.warn({ connectionId, attempt, err: err.message }, 'webhook retry scheduled')
    } else {
      logger.error({ connectionId, err: err.message }, 'webhook dropped after 3 attempts')
    }
  }
}

async function fetchInternal(path, opts = {}) {
  const url = `${BASE_URL}/api/v1${path}`
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Token': INTERNAL_TOKEN,
      ...(opts.headers || {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    timeout: 10000,
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`api ${res.status}: ${txt.slice(0, 200)}`)
  }
  return await res.json()
}

module.exports = { postWebhook, fetchInternal }
