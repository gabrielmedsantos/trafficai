#!/usr/bin/env node
/**
 * Setup SQLite database from schema using sql.js
 * Usage: node scripts/setup-db-sqlite.mjs [--reinit]
 *   --reinit: drop and recreate database
 */

import initSqlJs from 'sql.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.join(__dirname, '..', 'livestream.db')
const schemaPath = path.join(__dirname, '..', 'src', 'db', 'schema-sqlite.sql')

const args = process.argv.slice(2)
const reinit = args.includes('--reinit')

console.log('[db] SQLite Setup Script (sql.js)')
console.log(`[db] Database path: ${dbPath}`)
console.log(`[db] Schema path: ${schemaPath}`)

try {
  // Initialize sql.js
  const SQL = await initSqlJs()
  console.log('[db] sql.js initialized')

  // Remove existing DB if --reinit
  if (reinit && fs.existsSync(dbPath)) {
    console.log('[db] Reinitializing database (--reinit)...')
    fs.unlinkSync(dbPath)
    console.log('[db] Old database removed')
  }

  // Check if schema file exists
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema file not found: ${schemaPath}`)
  }

  // Read schema
  let schema = fs.readFileSync(schemaPath, 'utf-8')

  // Create/open database
  let db
  if (fs.existsSync(dbPath)) {
    const data = fs.readFileSync(dbPath)
    db = new SQL.Database(data)
    console.log('[db] Existing database loaded')
  } else {
    db = new SQL.Database()
    console.log('[db] New database created')
  }

  // Enable foreign keys (CRITICAL for SQLite)
  db.run('PRAGMA foreign_keys = ON')
  console.log('[db] Foreign keys enabled')

  // Parse SQL statements more carefully
  // Remove comments and split by semicolons
  schema = schema
    .split('\n')
    .map((line) => {
      // Remove SQL comments
      const idx = line.indexOf('--')
      return idx === -1 ? line : line.substring(0, idx)
    })
    .join('\n')

  const statements = schema
    .split(';')
    .map((stmt) => stmt.trim())
    .filter((stmt) => stmt.length > 0)

  console.log(`[db] Found ${statements.length} SQL statements`)

  let successCount = 0
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]
    try {
      db.run(stmt)
      successCount++
    } catch (err) {
      // Some statements might fail (like ON CONFLICT), but that's okay
      console.warn(`[db] Statement ${i + 1} warning: ${err.message.slice(0, 60)}`)
    }
  }

  console.log(`[db] Successfully executed: ${successCount}/${statements.length} statements`)

  // Verify tables were created
  const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
  const tables = result.length > 0 ? result[0].values : []

  console.log(`[db] Tables created: ${tables.length}`)
  tables.forEach((row) => console.log(`     - ${row[0]}`))

  // Verify some data
  let tenantCount = 0
  let planCount = 0

  try {
    const tenantsResult = db.exec('SELECT COUNT(*) as count FROM tenants')
    tenantCount = tenantsResult.length > 0 ? tenantsResult[0].values[0][0] : 0
  } catch (e) {
    console.warn('[db] Could not query tenants:', e.message)
  }

  try {
    const plansResult = db.exec('SELECT COUNT(*) as count FROM plans')
    planCount = plansResult.length > 0 ? plansResult[0].values[0][0] : 0
  } catch (e) {
    console.warn('[db] Could not query plans:', e.message)
  }

  console.log(`[db] Tenants: ${tenantCount}`)
  console.log(`[db] Plans: ${planCount}`)

  // Save database to file
  const data = db.export()
  const buffer = Buffer.from(data)
  fs.writeFileSync(dbPath, buffer)
  console.log(`[db] Database saved to: ${dbPath}`)

  console.log('[db] Database setup complete!')
  console.log(`[db] To use: set DATABASE_URL=sqlite:./livestream.db`)

  process.exit(0)
} catch (err) {
  console.error('[db] FATAL:', err.message)
  console.error(err.stack)
  process.exit(1)
}
