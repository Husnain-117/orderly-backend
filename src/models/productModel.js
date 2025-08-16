import { createDb } from '../lib/dbAdapter.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';

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
  await initDb();
  let items = db.data.products;
  if (ownerOnly && ownerId) items = items.filter((p) => p.ownerId === ownerId);
  return items;
}

export async function getProductById(id) {
  await initDb();
  return db.data.products.find((p) => p.id === id) || null;
}

export async function updateProduct(id, changes) {
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
  await initDb();
  const idx = db.data.products.findIndex((x) => x.id === id);
  if (idx === -1) return false;
  db.data.products.splice(idx, 1);
  await db.write();
  return true;
}
