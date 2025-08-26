import { createDb } from '../lib/dbAdapter.js'
import bcrypt from 'bcryptjs'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import crypto from 'crypto'
import { getSupabaseAdmin, isSupabaseConfigured } from '../lib/supabase.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// DB file at server root /data/db.json
const dataDir = path.join(__dirname, '../../data')
const dbFile = path.join(dataDir, 'db.json')

const defaultData = { users: [], salespersonLinks: [] }

// List salesperson link requests for a given distributor
export async function listSalespersonLinkRequestsForDistributor(distributorId) {
  await initDb()
  return db.data.salespersonLinks
    .filter((r) => r.distributorId === distributorId)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
}

export async function approveSalespersonLinkRequest(requestId, distributorId) {
  await initDb()
  const req = db.data.salespersonLinks.find((r) => r.id === requestId)
  if (!req) throw new Error('request_not_found')
  if (req.distributorId !== distributorId) throw new Error('forbidden')
  const now = new Date().toISOString()
  req.status = 'approved'
  req.updatedAt = now
  // Ensure only one active distributor per salesperson: unlink any other approved links
  const others = db.data.salespersonLinks.filter(
    (r) => r.salespersonId === req.salespersonId && r.distributorId !== distributorId
  )
  for (const r of others) {
    if (r.status === 'approved') {
      db.data.salespersonLinks.push({
        id: crypto.randomUUID(),
        salespersonId: r.salespersonId,
        distributorId: r.distributorId,
        status: 'unlinked',
        createdAt: now,
        updatedAt: now,
      })
    }
    if (r.status === 'pending') {
      r.status = 'rejected'
      r.updatedAt = now
    }
  }
  await db.write()
  return req
}

export async function rejectSalespersonLinkRequest(requestId, distributorId) {
  await initDb()
  const req = db.data.salespersonLinks.find((r) => r.id === requestId)
  if (!req) throw new Error('request_not_found')
  if (req.distributorId !== distributorId) throw new Error('forbidden')
  req.status = 'rejected'
  req.updatedAt = new Date().toISOString()
  await db.write()
  return req
}

// List currently linked salespersons (approved) for a distributor
export async function listLinkedSalespersonsForDistributor(distributorId) {
  await initDb()
  // Get latest record per salesperson for this distributor
  const bySalesperson = new Map()
  for (const r of db.data.salespersonLinks) {
    if (r.distributorId !== distributorId) continue
    const prev = bySalesperson.get(r.salespersonId)
    if (!prev || new Date(r.updatedAt) > new Date(prev.updatedAt)) {
      bySalesperson.set(r.salespersonId, r)
    }
  }
  const latest = Array.from(bySalesperson.values())
  return latest.filter((r) => r.status === 'approved')
}

// Unlink salesperson from distributor (marks latest link as unlinked)
export async function unlinkSalespersonFromDistributor(salespersonId, distributorId) {
  await initDb()
  // Find latest record for this pair
  const latest = db.data.salespersonLinks
    .filter((r) => r.salespersonId === salespersonId && r.distributorId === distributorId)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0]
  if (!latest) throw new Error('link_not_found')
  // Only allow unlink if currently approved or pending
  const now = new Date().toISOString()
  // Record state change to unlinked as a new entry to preserve history
  const newRec = {
    id: crypto.randomUUID(),
    salespersonId,
    distributorId,
    status: 'unlinked',
    createdAt: now,
    updatedAt: now,
  }
  db.data.salespersonLinks.push(newRec)
  await db.write()
  return newRec
}

let db
let initialized = false

export async function initDb() {
  if (initialized) return db
  try { fs.mkdirSync(dataDir, { recursive: true }) } catch {}
  const created = await createDb(dbFile, defaultData)
  db = created.db
  // Ensure collection exists
  db.data ||= { ...defaultData }
  db.data.users ||= []
  db.data.salespersonLinks ||= []
  // Optional env-based seeding for serverless/memory DBs
  try {
    if (!db.data.users.length) {
      const seedEmail = process.env.SEED_ADMIN_EMAIL
      const seedPass = process.env.SEED_ADMIN_PASSWORD
      const seedRole = process.env.SEED_ADMIN_ROLE || 'distributor'
      const seedOrg = process.env.SEED_ADMIN_ORG || 'Default Org'
      if (seedEmail && seedPass) {
        // Avoid duplicate if concurrently seeded
        const exists = db.data.users.find(u => u.email === String(seedEmail).trim().toLowerCase())
        if (!exists) {
          const salt = await bcrypt.genSalt(10)
          const passwordHash = await bcrypt.hash(seedPass, salt)
          db.data.users.push({
            id: crypto.randomUUID(),
            email: String(seedEmail).trim().toLowerCase(),
            passwordHash,
            role: seedRole,
            organizationName: seedOrg,
            createdAt: new Date().toISOString(),
          })
        }
      }
    }
  } catch {}
  await db.write()
  initialized = true
  return db
}

// -----------------------
// Supabase-backed helpers
// -----------------------
async function sbFindUserById(id) {
  const sb = getSupabaseAdmin()
  const { data, error } = await sb.from('users').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return data || null
}

async function sbFindUserByEmail(email) {
  const sb = getSupabaseAdmin()
  const { data, error } = await sb.from('users').select('*').eq('email', String(email).trim().toLowerCase()).maybeSingle()
  if (error) throw new Error(error.message)
  return data || null
}

async function sbCreateUser({ email, password, role, organizationName }) {
  const sb = getSupabaseAdmin()
  const salt = await bcrypt.genSalt(10)
  const passwordHash = await bcrypt.hash(password, salt)
  const row = {
    id: crypto.randomUUID(),
    email: String(email).trim().toLowerCase(),
    password_hash: passwordHash,
    role: role || null,
    organization_name: organizationName || null,
  }
  const { data, error } = await sb.from('users').insert(row).select('*').maybeSingle()
  if (error) throw new Error(error.message)
  return {
    id: data.id,
    email: data.email,
    role: data.role,
    organizationName: data.organization_name,
  }
}

async function sbUpdateUserPassword(email, newPassword) {
  const sb = getSupabaseAdmin()
  const salt = await bcrypt.genSalt(10)
  const passwordHash = await bcrypt.hash(newPassword, salt)
  const { data, error } = await sb
    .from('users')
    .update({ password_hash: passwordHash })
    .eq('email', String(email).trim().toLowerCase())
    .select('*')
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('user not found')
  return { id: data.id, email: data.email, role: data.role, organizationName: data.organization_name }
}

async function sbUpdateUserProfile(userId, profileData) {
  const sb = getSupabaseAdmin()
  const updates = {
    organization_name: profileData.organizationName,
    name: profileData.name,
    phone: profileData.phone,
    address: profileData.address,
    photo: profileData.photo,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await sb.from('users').update(updates).eq('id', userId).select('*').maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('User not found')
  return {
    id: data.id,
    email: data.email,
    role: data.role,
    organizationName: data.organization_name,
    name: data.name,
    phone: data.phone,
    address: data.address,
    photo: data.photo,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  }
}

export async function findUserById(id) {
  if (isSupabaseConfigured()) {
    return sbFindUserById(id)
  }
  await initDb();
  return db.data.users.find(u => u.id === id) || null;
}

export async function findUserByEmail(email) {
  if (isSupabaseConfigured()) {
    const sbUser = await sbFindUserByEmail(email)
    if (sbUser) return sbUser
    // Fallback to LowDB if not present in Supabase
    await initDb()
    const normalized = String(email).trim().toLowerCase()
    return db.data.users.find((u) => u.email === normalized) || null
  }
  await initDb()
  email = String(email).trim().toLowerCase()
  return db.data.users.find((u) => u.email === email) || null
}

export async function createUser({ email, password, role, organizationName }) {
  if (isSupabaseConfigured()) {
    const exists = await sbFindUserByEmail(email)
    if (exists) throw new Error('User already exists')
    try {
      return await sbCreateUser({ email, password, role, organizationName })
    } catch (err) {
      const msg = String(err?.message || '').toLowerCase()
      // If Supabase has a role check constraint not yet updated to include 'salesperson', fallback to LowDB
      if (msg.includes('check constraint') || msg.includes('users_role_check') || msg.includes('violates')) {
        // Create locally to unblock registration
        await initDb()
        const normalized = String(email).trim().toLowerCase()
        const dup = db.data.users.find((u) => u.email === normalized)
        if (dup) throw new Error('User already exists')
        const salt = await bcrypt.genSalt(10)
        const passwordHash = await bcrypt.hash(password, salt)
        const user = {
          id: crypto.randomUUID(),
          email: normalized,
          passwordHash,
          role: role || null,
          organizationName: organizationName || null,
          createdAt: new Date().toISOString(),
        }
        db.data.users.push(user)
        await db.write()
        return { ...user, passwordHash: undefined }
      }
      throw err
    }
  }
  await initDb()
  email = String(email).trim().toLowerCase()
  const exists = await findUserByEmail(email)
  if (exists) throw new Error('User already exists')
  const salt = await bcrypt.genSalt(10)
  const passwordHash = await bcrypt.hash(password, salt)
  const user = {
    id: crypto.randomUUID(),
    email,
    passwordHash,
    role: role || null,
    organizationName: organizationName || null,
    createdAt: new Date().toISOString(),
  }
  db.data.users.push(user)
  await db.write()
  return { ...user, passwordHash: undefined }
}

export async function verifyPassword(email, password) {
  if (isSupabaseConfigured()) {
    // Try Supabase first
    const sbu = await sbFindUserByEmail(email)
    if (sbu) {
      const ok = await bcrypt.compare(password, sbu.password_hash)
      if (!ok) return null
      return { id: sbu.id, email: sbu.email, role: sbu.role, organizationName: sbu.organization_name }
    }
    // Auto-migrate: if exists in LowDB and password matches, upsert into Supabase, then return
    await initDb()
    const local = db.data.users.find((u) => u.email === String(email).trim().toLowerCase())
    if (!local) return null
    const okLocal = await bcrypt.compare(password, local.passwordHash)
    if (!okLocal) return null
    // Upsert to Supabase
    const sb = getSupabaseAdmin()
    const upsertRow = {
      id: local.id,
      email: local.email,
      password_hash: local.passwordHash,
      role: local.role,
      organization_name: local.organizationName,
      created_at: local.createdAt,
      updated_at: new Date().toISOString(),
    }
    const { error } = await sb.from('users').upsert(upsertRow)
    if (error) {
      // ignore migration failure, but still allow login using local data
      // eslint-disable-next-line no-console
      if (process.env.NODE_ENV !== 'production') console.warn('Supabase upsert failed:', error.message)
    }
    return { id: local.id, email: local.email, role: local.role, organizationName: local.organizationName }
  }
  // Pure LowDB path
  const user = await findUserByEmail(email)
  if (!user) return null
  const ok = await bcrypt.compare(password, user.passwordHash)
  if (!ok) return null
  return { id: user.id, email: user.email, role: user.role, organizationName: user.organizationName }
}

export async function updateUserPassword(email, newPassword) {
  if (isSupabaseConfigured()) {
    return sbUpdateUserPassword(email, newPassword)
  }
  await initDb()
  email = String(email).trim().toLowerCase()
  const user = db.data.users.find((u) => u.email === email)
  if (!user) throw new Error('user not found')
  const salt = await bcrypt.genSalt(10)
  const passwordHash = await bcrypt.hash(newPassword, salt)
  user.passwordHash = passwordHash
  await db.write()
  return { id: user.id, email: user.email, role: user.role, organizationName: user.organizationName }
}

export async function updateUserProfile(userId, profileData) {
  if (isSupabaseConfigured()) {
    return sbUpdateUserProfile(userId, profileData)
  }
  await initDb()
  const user = db.data.users.find((u) => u.id === userId)
  if (!user) throw new Error('User not found')
  
  // Update allowed profile fields
  if (profileData.organizationName !== undefined) {
    user.organizationName = profileData.organizationName
  }
  if (profileData.name !== undefined) {
    user.name = profileData.name
  }
  if (profileData.phone !== undefined) {
    user.phone = profileData.phone
  }
  if (profileData.address !== undefined) {
    user.address = profileData.address
  }
  if (profileData.photo !== undefined) {
    user.photo = profileData.photo
  }
  
  user.updatedAt = new Date().toISOString()
  await db.write()
  
  return { 
    id: user.id, 
    email: user.email, 
    role: user.role, 
    organizationName: user.organizationName,
    name: user.name,
    phone: user.phone,
    address: user.address,
    photo: user.photo,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  }
}

// -------------------------------
// Salesperson link helper methods
// -------------------------------
export async function createSalespersonLinkRequest({ salespersonId, distributorId }) {
  await initDb()
  const now = new Date().toISOString()
  // Enforce constraints
  // 1) If salesperson currently has an approved link (to any distributor), block until unlinked
  const latest = db.data.salespersonLinks
    .filter((r) => r.salespersonId === salespersonId)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0]
  if (latest && latest.status === 'approved') {
    throw new Error('already_linked_active')
  }
  // 2) If there is a pending request to the same distributor, do not create duplicate
  const pendingSame = db.data.salespersonLinks.find(
    (r) => r.salespersonId === salespersonId && r.distributorId === distributorId && r.status === 'pending'
  )
  if (pendingSame) {
    throw new Error('already_requested')
  }
  // 3) If there is a pending request to a different distributor, update that record to point here
  let pendingAny = db.data.salespersonLinks.find(
    (r) => r.salespersonId === salespersonId && r.status === 'pending'
  )
  if (pendingAny) {
    pendingAny.distributorId = distributorId
    pendingAny.updatedAt = now
    await db.write()
    return pendingAny
  }
  // Otherwise create new pending request
  const rec = {
    id: crypto.randomUUID(),
    salespersonId,
    distributorId,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  }
  db.data.salespersonLinks.push(rec)
  await db.write()
  return rec
}

export async function getSalespersonLinkStatus(salespersonId) {
  await initDb()
  // Find latest request by updatedAt
  const requests = db.data.salespersonLinks
    .filter((r) => r.salespersonId === salespersonId)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
  if (!requests.length) {
    return { state: 'unlinked' }
  }
  const latest = requests[0]
  return {
    state: latest.status, // pending | approved | rejected
    distributorId: latest.distributorId,
    requestId: latest.id,
  }
}
