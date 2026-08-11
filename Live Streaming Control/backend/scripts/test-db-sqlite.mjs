#!/usr/bin/env node
/**
 * Test SQLite database connectivity and queries
 * Usage: node scripts/test-db-sqlite.mjs
 */

import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Set environment variable
process.env.DATABASE_URL = 'sqlite:./livestream.db'
process.env.NODE_ENV = 'development'

// Change to backend directory
process.chdir(path.join(__dirname, '..'))

// Import db module
import('../src/db/client.js').then(async (dbModule) => {
  const { query } = dbModule.default

  console.log('[test] SQLite Database Test')
  console.log('[test] Database URL:', process.env.DATABASE_URL)

  try {
    // Test 1: Query tenants
    console.log('\n[test] Test 1: Query tenants')
    const tenantsRes = await query('SELECT * FROM tenants LIMIT 1')
    console.log('  Result:', tenantsRes.rows)
    console.log('  Row count:', tenantsRes.rowCount)

    // Test 2: Query plans
    console.log('\n[test] Test 2: Query plans')
    const plansRes = await query('SELECT * FROM plans')
    console.log('  Plans found:', plansRes.rowCount)
    plansRes.rows.forEach((p) => console.log(`    - ${p.name} ($${p.price_brl})`))

    // Test 3: Test parameter binding
    console.log('\n[test] Test 3: Test parameter binding with PostgreSQL style')
    const testRes = await query('SELECT * FROM plans WHERE name = $1', ['free'])
    console.log('  Free plan:', testRes.rows[0])

    // Test 4: Insert test data
    console.log('\n[test] Test 4: Insert test user')
    const userId = 'test-user-' + Date.now()
    const insertRes = await query(
      'INSERT INTO users (id, email, password_hash, name) VALUES ($1, $2, $3, $4)',
      [userId, 'test@example.com', 'hash', 'Test User']
    )
    console.log('  Insert result:', insertRes.rowCount, 'row inserted')

    // Test 5: Query inserted data
    console.log('\n[test] Test 5: Query inserted user')
    const userRes = await query('SELECT * FROM users WHERE id = $1', [userId])
    console.log('  User found:', userRes.rows[0])

    // Test 6: Update test
    console.log('\n[test] Test 6: Update user')
    const updateRes = await query('UPDATE users SET name = $1 WHERE id = $2', [
      'Updated Test User',
      userId,
    ])
    console.log('  Update result:', updateRes.rowCount, 'row updated')

    // Test 7: Verify update
    console.log('\n[test] Test 7: Verify update')
    const verifyRes = await query('SELECT * FROM users WHERE id = $1', [userId])
    console.log('  User name:', verifyRes.rows[0].name)

    // Test 8: Delete test
    console.log('\n[test] Test 8: Delete user')
    const deleteRes = await query('DELETE FROM users WHERE id = $1', [userId])
    console.log('  Delete result:', deleteRes.rowCount, 'row deleted')

    console.log('\n[test] All tests passed!')
    process.exit(0)
  } catch (err) {
    console.error('[test] ERROR:', err.message)
    console.error(err.stack)
    process.exit(1)
  }
})
