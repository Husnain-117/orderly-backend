import { createDb } from '../lib/dbAdapter.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import { getSupabaseAdmin, isSupabaseConfigured } from '../lib/supabase.js'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// Use same DB file as users, add products collection
const dataDir = path.join(__dirname, '../../data');
const dbFile = path.join(dataDir, 'db.json');

const defaultData = { users: [], products: [] };

let db;
let initialized = false;

export async function initDb() {
  if (initialized) return db;
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch {}
  const created = await createDb(dbFile, defaultData);
  db = created.db;
  db.data ||= { ...defaultData };
  db.data.products ||= [];
  db.data.users ||= db.data.users || [];
  await db.write();
  initialized = true;
  return db;
}

export async function createProduct({ ownerId, name, price, stock, image, description }) {
  if (isSupabaseConfigured()) {
    const sb = getSupabaseAdmin()
    const row = {
      id: crypto.randomUUID(),
      owner_user_id: ownerId || null,
      name: String(name).trim(),
      price: Number(price || 0),
      stock: Number(stock ?? 0),
      images: image ? [String(image).trim()] : null,
      description: description ? String(description).trim() : null,
    }
    const { data, error } = await sb.from('products').insert(row).select('*').maybeSingle()
    if (error) throw new Error(error.message)
    const imgs = Array.isArray(data.images)
      ? data.images
      : (typeof data.images === 'string'
          ? (() => { try { const v = JSON.parse(data.images); return Array.isArray(v) ? v : []; } catch { return []; } })()
          : []);
    return {
      id: data.id,
      ownerId: data.owner_user_id,
      name: data.name,
      price: Number(data.price),
      stock: Number(data.stock),
      image: imgs[0] || null,
      description: data.description || '',
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    }
  }
  await initDb();
  const product = {
    id: crypto.randomUUID(),
    ownerId, // distributor id
    name: String(name).trim(),
    price: Number(price),
    stock: Number(stock ?? 0),
    image: image ? String(image).trim() : null,
    description: description ? String(description).trim() : '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.data.products.push(product);
  await db.write();
  return product;
}

export async function listProducts({ ownerOnly, ownerId } = {}) {
  if (isSupabaseConfigured()) {
    const sb = getSupabaseAdmin()
    let query = sb.from('products').select('*')
    if (ownerOnly && ownerId) query = query.eq('owner_user_id', ownerId)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    return (data || []).map(p => {
      const imgs = Array.isArray(p.images)
        ? p.images
        : (typeof p.images === 'string'
            ? (() => { try { const v = JSON.parse(p.images); return Array.isArray(v) ? v : []; } catch { return []; } })()
            : []);
      return ({
      id: p.id,
      ownerId: p.owner_user_id,
      name: p.name,
      price: Number(p.price),
      stock: Number(p.stock),
      image: imgs[0] || null,
      description: p.description || '',
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    })
    })
  }
  await initDb();
  let items = db.data.products;
  if (ownerOnly && ownerId) items = items.filter((p) => p.ownerId === ownerId);
  return items;
}

export async function getProductById(id) {
  if (isSupabaseConfigured()) {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.from('products').select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null
    const imgs = Array.isArray(data.images)
      ? data.images
      : (typeof data.images === 'string'
          ? (() => { try { const v = JSON.parse(data.images); return Array.isArray(v) ? v : []; } catch { return []; } })()
          : []);
    return {
      id: data.id,
      ownerId: data.owner_user_id,
      name: data.name,
      price: Number(data.price),
      stock: Number(data.stock),
      image: imgs[0] || null,
      description: data.description || '',
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    }
  }
  await initDb();
  return db.data.products.find((p) => p.id === id) || null;
}

export async function updateProduct(id, changes) {
  if (isSupabaseConfigured()) {
    const sb = getSupabaseAdmin()
    const patch = {}
    if (changes.name !== undefined) patch.name = String(changes.name).trim()
    if (changes.price !== undefined) patch.price = Number(changes.price)
    if (changes.stock !== undefined) patch.stock = Number(changes.stock)
    if (changes.image !== undefined) patch.images = changes.image ? [String(changes.image).trim()] : null
    if (changes.description !== undefined) patch.description = String(changes.description).trim()
    // bulk pricing removed
    patch.updated_at = new Date().toISOString()
    const { data, error } = await sb.from('products').update(patch).eq('id', id).select('*').maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null
    const imgs = Array.isArray(data.images)
      ? data.images
      : (typeof data.images === 'string'
          ? (() => { try { const v = JSON.parse(data.images); return Array.isArray(v) ? v : []; } catch { return []; } })()
          : []);
    return {
      id: data.id,
      ownerId: data.owner_user_id,
      name: data.name,
      price: Number(data.price),
      stock: Number(data.stock),
      image: imgs[0] || null,
      description: data.description || '',
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    }
  }
  await initDb();
  const p = db.data.products.find((x) => x.id === id);
  if (!p) return null;
  if (changes.name !== undefined) p.name = String(changes.name).trim();
  if (changes.price !== undefined) p.price = Number(changes.price);
  if (changes.stock !== undefined) p.stock = Number(changes.stock);
  if (changes.image !== undefined) p.image = changes.image ? String(changes.image).trim() : null;
  if (changes.description !== undefined) p.description = String(changes.description).trim();
  p.updatedAt = new Date().toISOString();
  await db.write();
  return p;
}

export async function deleteProduct(id) {
  if (isSupabaseConfigured()) {
    const sb = getSupabaseAdmin()
    const { error } = await sb.from('products').delete().eq('id', id)
    if (error) throw new Error(error.message)
    return true
  }
  await initDb();
  const idx = db.data.products.findIndex((x) => x.id === id);
  if (idx === -1) return false;
  db.data.products.splice(idx, 1);
  await db.write();
  return true;
}


