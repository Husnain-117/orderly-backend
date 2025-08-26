#!/usr/bin/env node
// Migrate local LowDB data (server/data/db.json) to Supabase
// Requirements:
// - Environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// - Run the SQL in supabase/schema.sql in your Supabase project first (tables + policies)

import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')
const dataFile = path.resolve(root, 'data', 'db.json')

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY envs')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })

function readJson(p) {
  if (!fs.existsSync(p)) return null
  const raw = fs.readFileSync(p, 'utf8')
  try { return JSON.parse(raw) } catch { return null }
}

function normEmail(e) { return String(e || '').trim().toLowerCase() }

async function upsertUsers(users = []) {
  if (!users.length) return
  const rows = users.map(u => ({
    id: u.id,
    email: normEmail(u.email),
    password_hash: u.passwordHash, // keep existing hash
    role: u.role || null,
    organization_name: u.organizationName || null,
    name: u.name || null,
    phone: u.phone || null,
    address: u.address || null,
    photo: u.photo || null,
    created_at: u.createdAt || null,
    updated_at: u.updatedAt || null,
  }))
  const { error } = await sb.from('users').upsert(rows, { onConflict: 'id' })
  if (error) throw new Error('users upsert failed: ' + error.message)
}

async function upsertProducts(products = []) {
  if (!products.length) return
  const rows = products.map(p => ({
    id: p.id,
    name: p.name,
    sku: p.sku || null,
    description: p.description || null,
    price: Number(p.price || 0),
    stock: Number(p.stock || 0),
    images: p.images ? JSON.stringify(p.images) : (p.image ? JSON.stringify([p.image]) : null),
    owner_user_id: p.ownerId || null,
    created_at: p.createdAt || null,
    updated_at: p.updatedAt || null,
  }))
  const { error } = await sb.from('products').upsert(rows, { onConflict: 'id' })
  if (error) throw new Error('products upsert failed: ' + error.message)
}

async function insertOrders(orders = []) {
  if (!orders.length) return
  // Map order statuses from LowDB to new enum
  const mapStatus = s => ({
    pending: 'pending',
    placed: 'confirmed',
    accepted: 'confirmed',
    out_for_delivery: 'shipped',
    delivered: 'delivered',
  }[s] || 'pending')

  for (const o of orders) {
    const total = Array.isArray(o.items) ? o.items.reduce((sum, it) => sum + Number(it.price || 0) * Number(it.qty || 0), 0) : 0
    const orderRow = {
      id: o.id,
      user_id: o.userId,
      status: mapStatus(o.status),
      total,
      notes: o.notes || null,
      created_at: o.createdAt || null,
      updated_at: o.updatedAt || null,
    }
    const { error: oErr } = await sb.from('orders').upsert(orderRow, { onConflict: 'id' })
    if (oErr) throw new Error('order upsert failed: ' + oErr.message)

    if (Array.isArray(o.items) && o.items.length) {
      const itemsRows = o.items.map(it => ({
        id: it.id || undefined, // let DB generate if missing
        order_id: o.id,
        product_id: it.productId || null,
        quantity: Number(it.qty || it.quantity || 0),
        unit_price: Number(it.price || 0),
      }))
      const { error: iErr } = await sb.from('order_items').insert(itemsRows)
      if (iErr) throw new Error('order_items insert failed: ' + iErr.message)
    }
  }
}

async function main() {
  const data = readJson(dataFile)
  if (!data) {
    console.error('No data found at', dataFile)
    process.exit(1)
  }
  console.log('Migrating...')
  await upsertUsers(data.users || [])
  await upsertProducts(data.products || [])
  await insertOrders(data.orders || [])
  console.log('Done.')
}

main().catch(err => { console.error(err); process.exit(1) })
