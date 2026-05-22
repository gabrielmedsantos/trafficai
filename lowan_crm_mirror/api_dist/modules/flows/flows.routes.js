'use strict'
const { prisma } = require('../../config/database')
const { authenticateLeadUser } = require('../leads/leads.middleware')

async function flowsRoutes(app) {
  app.register(async function(authed) {
    authed.addHook('preHandler', authenticateLeadUser)

    authed.get('/', async function(req, reply) {
      const wid = req.leadUser.workspaceId
      const flows = await prisma.$queryRawUnsafe(
        'SELECT id, name, description, status, trigger, nodes, edges, created_at AS "createdAt", updated_at AS "updatedAt" FROM flows WHERE workspace_id = $1::uuid ORDER BY updated_at DESC',
        wid
      )
      return reply.send(flows)
    })

    authed.post('/', async function(req, reply) {
      const wid = req.leadUser.workspaceId
      const { name, description } = req.body || {}
      if (!name) return reply.status(400).send({ message: 'Nome obrigatório' })
      const rows = await prisma.$queryRawUnsafe(
        'INSERT INTO flows (workspace_id, name, description, status, nodes, edges) VALUES ($1::uuid, $2, $3, \'DRAFT\', \'[]\', \'[]\') RETURNING id, name, description, status, trigger, nodes, edges, created_at AS "createdAt", updated_at AS "updatedAt"',
        wid, name, description || null
      )
      return reply.status(201).send(rows[0])
    })

    authed.get('/meta', async function(req, reply) {
      const wid = req.leadUser.workspaceId
      const [stages, users] = await Promise.all([
        prisma.$queryRawUnsafe(
          'SELECT s.id, s.name FROM stages s JOIN pipelines p ON s.pipeline_id = p.id WHERE p.workspace_id = $1::uuid ORDER BY s.position',
          wid
        ),
        prisma.$queryRawUnsafe(
          'SELECT id, name FROM users WHERE workspace_id = $1::uuid AND active = true ORDER BY name',
          wid
        ),
      ])
      return reply.send({ stages, users, tags: [], templates: [] })
    })

    authed.get('/:id', async function(req, reply) {
      const wid = req.leadUser.workspaceId
      const rows = await prisma.$queryRawUnsafe(
        'SELECT id, name, description, status, trigger, nodes, edges, created_at AS "createdAt", updated_at AS "updatedAt" FROM flows WHERE id = $1::uuid AND workspace_id = $2::uuid',
        req.params.id, wid
      )
      if (!rows[0]) return reply.status(404).send({ message: 'Fluxo não encontrado' })
      return reply.send(rows[0])
    })

    authed.put('/:id', async function(req, reply) {
      const wid = req.leadUser.workspaceId
      const { name, nodes, edges } = req.body || {}
      if (!name) return reply.status(400).send({ message: 'Nome obrigatório' })
      const triggerNode = (nodes || []).find(function(n) { return n.type === 'trigger' })
      const trigger = triggerNode ? { type: triggerNode.data && triggerNode.data.triggerType, config: triggerNode.data && triggerNode.data.config } : null
      const rows = await prisma.$queryRawUnsafe(
        'UPDATE flows SET name = $3, nodes = $4::jsonb, edges = $5::jsonb, trigger = $6::jsonb, updated_at = NOW() WHERE id = $1::uuid AND workspace_id = $2::uuid RETURNING id, name, description, status, trigger, nodes, edges, created_at AS "createdAt", updated_at AS "updatedAt"',
        req.params.id, wid, name, JSON.stringify(nodes || []), JSON.stringify(edges || []), trigger ? JSON.stringify(trigger) : null
      )
      if (!rows[0]) return reply.status(404).send({ message: 'Fluxo não encontrado' })
      return reply.send(rows[0])
    })

    authed.patch('/:id/status', async function(req, reply) {
      const wid = req.leadUser.workspaceId
      const { status } = req.body || {}
      if (!['ACTIVE','PAUSED','DRAFT'].includes(status)) return reply.status(400).send({ message: 'Status inválido' })
      const rows = await prisma.$queryRawUnsafe(
        'UPDATE flows SET status = $3, updated_at = NOW() WHERE id = $1::uuid AND workspace_id = $2::uuid RETURNING id, name, status',
        req.params.id, wid, status
      )
      if (!rows[0]) return reply.status(404).send({ message: 'Fluxo não encontrado' })
      return reply.send(rows[0])
    })

    authed.post('/:id/duplicate', async function(req, reply) {
      const wid = req.leadUser.workspaceId
      const orig = await prisma.$queryRawUnsafe(
        'SELECT * FROM flows WHERE id = $1::uuid AND workspace_id = $2::uuid',
        req.params.id, wid
      )
      if (!orig[0]) return reply.status(404).send({ message: 'Fluxo não encontrado' })
      const o = orig[0]
      const rows = await prisma.$queryRawUnsafe(
        'INSERT INTO flows (workspace_id, name, description, status, nodes, edges, trigger) VALUES ($1::uuid, $2, $3, \'DRAFT\', $4::jsonb, $5::jsonb, $6::jsonb) RETURNING id, name, description, status, trigger, nodes, edges, created_at AS "createdAt", updated_at AS "updatedAt"',
        wid, o.name + ' (cópia)', o.description || null,
        JSON.stringify(o.nodes || []), JSON.stringify(o.edges || []),
        o.trigger ? JSON.stringify(o.trigger) : null
      )
      return reply.status(201).send(rows[0])
    })

    authed.delete('/:id', async function(req, reply) {
      const wid = req.leadUser.workspaceId
      await prisma.$queryRawUnsafe(
        'DELETE FROM flows WHERE id = $1::uuid AND workspace_id = $2::uuid',
        req.params.id, wid
      )
      return reply.status(204).send()
    })
  })
}

module.exports = flowsRoutes
module.exports.default = flowsRoutes
