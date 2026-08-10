/**
 * Co-streaming Invites Routes
 * Manage costream invitations for traders
 */
import { z } from 'zod'
import db from '../db/client.js'

export default async function costreamInvitesRoutes(fastify) {

  // ── GET /costream/invites/pending — list pending costream invites ───────────
  // Returns lives where current user is costream_trader_b_id
  fastify.get('/costream/invites/pending', {
    preHandler: async (req, reply) => {
      try {
        await req.jwtVerify()
      } catch (err) {
        return reply.code(401).send({ error: 'Unauthorized' })
      }
    },
  }, async (req, reply) => {

    try {
      const { rows } = await db.query(
        `SELECT
          l.id,
          l.short_id,
          l.title,
          l.status,
          l.mode_broadcast,
          l.costream_trader_a_id,
          u.name as trader_a_name,
          l.created_at,
          l.scheduled_at
        FROM lives l
        JOIN users u ON l.user_id = u.id
        WHERE l.mode_broadcast = 'costream'
          AND l.costream_trader_b_id = $1
          AND l.status IN ('waiting', 'live')
        ORDER BY l.created_at DESC`,
        [req.user.id]
      )

      return {
        ok: true,
        invites: rows.map(row => ({
          id: row.id,
          short_id: row.short_id,
          title: row.title,
          status: row.status,
          trader_a_name: row.trader_a_name,
          created_at: row.created_at,
          scheduled_at: row.scheduled_at,
          join_url: `/host/${row.short_id || row.id}`,
        })),
      }
    } catch (err) {
      fastify.log.error(`[costream-invites] Failed to list pending:`, err)
      return reply.code(500).send({ error: err.message })
    }
  })

  // ── GET /costream/invites/:liveId/info — get invite details ────────────────
  fastify.get('/costream/invites/:liveId/info', async (req, reply) => {
    const { liveId } = req.params

    try {
      const { rows } = await db.query(
        `SELECT
          l.id,
          l.short_id,
          l.title,
          l.status,
          l.description,
          l.mode_broadcast,
          l.costream_trader_a_id,
          u.name as trader_a_name,
          l.created_at,
          l.scheduled_at
        FROM lives l
        JOIN users u ON l.user_id = u.id
        WHERE (l.id = $1 OR l.short_id = $1)
          AND l.mode_broadcast = 'costream'`,
        [liveId]
      )

      if (!rows.length) {
        return reply.code(404).send({ error: 'Invite not found' })
      }

      const row = rows[0]
      return {
        ok: true,
        invite: {
          id: row.id,
          short_id: row.short_id,
          title: row.title,
          description: row.description,
          status: row.status,
          trader_a_name: row.trader_a_name,
          created_at: row.created_at,
          scheduled_at: row.scheduled_at,
          join_url: `/host/${row.short_id || row.id}`,
        },
      }
    } catch (err) {
      fastify.log.error(`[costream-invites] Failed to get info:`, err)
      return reply.code(500).send({ error: err.message })
    }
  })

  // ── GET /costream/live/:liveId/can-join — check if user can join as trader ──
  // Returns which position (A or B) user can join as
  fastify.get('/costream/live/:liveId/can-join', {
    preHandler: async (req, reply) => {
      try {
        await req.jwtVerify()
      } catch (err) {
        return reply.code(401).send({ error: 'Unauthorized' })
      }
    },
  }, async (req, reply) => {

    const { liveId } = req.params

    try {
      const { rows } = await db.query(
        `SELECT
          id,
          mode_broadcast,
          costream_trader_a_id,
          costream_trader_b_id
        FROM lives
        WHERE id = $1 OR short_id = $1`,
        [liveId]
      )

      if (!rows.length) {
        return reply.code(404).send({ error: 'Live not found' })
      }

      const live = rows[0]

      if (live.mode_broadcast !== 'costream') {
        return reply.code(400).send({ error: 'Not a costream live' })
      }

      // Check if user is assigned
      if (live.costream_trader_a_id === req.user.id) {
        return { position: 'A', can_join: true }
      }

      if (live.costream_trader_b_id === req.user.id) {
        return { position: 'B', can_join: true }
      }

      return { position: null, can_join: false }
    } catch (err) {
      fastify.log.error(`[costream-invites] Failed to check join:`, err)
      return reply.code(500).send({ error: err.message })
    }
  })
}
