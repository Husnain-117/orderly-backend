import { createDb } from '../lib/dbAdapter.js'
import bcrypt from 'bcryptjs'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import crypto from 'crypto'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// DB file at server root /data/db.json
const dataDir = path.join(__dirname, '../../data')
const dbFile = path.join(dataDir, 'db.json')

const defaultData = { users: [] }

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

export async function findUserById(id) {
  await initDb();
  return db.data.users.find(u => u.id === id) || null;
}

export async function findUserByEmail(email) {
  await initDb()
  email = String(email).trim().toLowerCase()
  return db.data.users.find((u) => u.email === email) || null
}

export async function createUser({ email, password, role, organizationName }) {
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
  const user = await findUserByEmail(email)
  if (!user) return null
  const ok = await bcrypt.compare(password, user.passwordHash)
  if (!ok) return null
  return { id: user.id, email: user.email, role: user.role, organizationName: user.organizationName }
}

export async function updateUserPassword(email, newPassword) {
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
