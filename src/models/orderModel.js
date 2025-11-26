import { createDb } from '../lib/dbAdapter.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import { getSupabaseAdmin, isSupabaseConfigured } from '../lib/supabase.js'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, '../../data');
const dbFile = path.join(dataDir, 'db.json');

const defaultData = { orders: [] };

let db;
let initialized = false;

export async function initDb() {
  if (initialized) return db;
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch {}
  const created = await createDb(dbFile, defaultData);
  db = created.db;
  db.data ||= { ...defaultData };
  db.data.orders ||= [];
  await db.write();
  initialized = true;
  return db;
}

export async function createOrder({ userId, items, distributorId, distributorName, shopName }) {
  if (isSupabaseConfigured()) {
    const sb = getSupabaseAdmin()
    const orderId = crypto.randomUUID()
    const total = Array.isArray(items) ? items.reduce((s, it) => s + Number(it.price || 0) * Number(it.qty || 0), 0) : 0
    const row = {
      id: orderId,
      user_id: userId,
      status: 'pending',
      total,
      notes: null,
      // store distributor info as notes for now (schema keeps minimal fields)
    }
    const { error: oErr, data } = await sb.from('orders').insert(row).select('*').maybeSingle()
    if (oErr) throw new Error(oErr.message)
    if (Array.isArray(items) && items.length) {
      const itemsRows = items.map(it => ({
        order_id: orderId,
        product_id: it.productId || null,
        quantity: Number(it.qty || 0),
        unit_price: Number(it.price || 0),
      }))
      const { error: iErr } = await sb.from('order_items').insert(itemsRows)
      if (iErr) throw new Error(iErr.message)
    }
    // Return shape compatible with existing consumers
    return {
      id: data.id,
      userId,
      items,
      distributorId,
      distributorName,
      shopName,
      status: data.status,
      createdAt: data.created_at,
    }
  }
  await initDb();
  const order = {
    id: crypto.randomUUID(),
    userId,
    items, // [{ productId, qty, name, price, shopName }]
    distributorId,
    distributorName,
    shopName,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.data.orders.push(order);
  await db.write();
  return order;
}

export async function getOrdersByUser(userId) {
  if (isSupabaseConfigured()) {
    const sb = getSupabaseAdmin()
    const { data: orders, error } = await sb.from('orders').select('*, order_items(*)').eq('user_id', userId).order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (orders || []).map(o => ({
      id: o.id,
      userId: o.user_id,
      items: (o.order_items || []).map(oi => ({ productId: oi.product_id, qty: oi.quantity, price: oi.unit_price })),
      status: o.status,
      createdAt: o.created_at,
    }))
  }
  await initDb();
  return db.data.orders.filter(o => o.userId === userId);
}

export async function updateOrderItems(orderId, items) {
  if (isSupabaseConfigured()) {
    const sb = getSupabaseAdmin()
    // Ensure order is pending
    const { data: ord, error: gErr } = await sb.from('orders').select('*').eq('id', orderId).maybeSingle()
    if (gErr) throw new Error(gErr.message)
    if (!ord || ord.status !== 'pending') return null
    // Replace items
    const { error: delErr } = await sb.from('order_items').delete().eq('order_id', orderId)
    if (delErr) throw new Error(delErr.message)
    if (Array.isArray(items) && items.length) {
      const rows = items.map(it => ({
        order_id: orderId,
        product_id: it.productId || null,
        quantity: Number(it.qty || 0),
        unit_price: Number(it.price || 0),
      }))
      const { error: insErr } = await sb.from('order_items').insert(rows)
      if (insErr) throw new Error(insErr.message)
    }
    // Update total
    const total = Array.isArray(items) ? items.reduce((s, it) => s + Number(it.price || 0) * Number(it.qty || 0), 0) : 0
    const { data: upd, error: uErr } = await sb.from('orders').update({ total, updated_at: new Date().toISOString() }).eq('id', orderId).select('*').maybeSingle()
    if (uErr) throw new Error(uErr.message)
    return { id: upd.id, userId: upd.user_id, items, status: upd.status, createdAt: upd.created_at }
  }
  await initDb();
  const order = db.data.orders.find(o => o.id === orderId);
  if (order && order.status === 'pending') {
    order.items = items;
    order.updatedAt = new Date().toISOString();
    await db.write();
    return order;
  }
  return null;
}

export async function removeOrder(orderId, userId) {
  if (isSupabaseConfigured()) {
    const sb = getSupabaseAdmin()
    // only allow delete if pending and owned by userId
    const { data: ord, error: gErr } = await sb.from('orders').select('*').eq('id', orderId).maybeSingle()
    if (gErr) throw new Error(gErr.message)
    if (!ord || ord.user_id !== userId || ord.status !== 'pending') return false
    const { error: delItemsErr } = await sb.from('order_items').delete().eq('order_id', orderId)
    if (delItemsErr) throw new Error(delItemsErr.message)
    const { error: delErr } = await sb.from('orders').delete().eq('id', orderId)
    if (delErr) throw new Error(delErr.message)
    return true
  }
  await initDb();
  const idx = db.data.orders.findIndex(o => o.id === orderId && o.userId === userId && o.status === 'pending');
  if (idx !== -1) {
    db.data.orders.splice(idx, 1);
    await db.write();
    return true;
  }
  return false;
}

export async function markPlaced(orderId) {
  if (isSupabaseConfigured()) {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.from('orders').update({ status: 'placed', updated_at: new Date().toISOString() }).eq('id', orderId).select('*').maybeSingle()
    if (error) throw new Error(error.message)
    return data ? { id: data.id, userId: data.user_id, status: data.status, createdAt: data.created_at } : null
  }
  await initDb();
  const order = db.data.orders.find(o => o.id === orderId);
  if (order) {
    order.status = 'placed';
    order.placedAt = new Date().toISOString();
    await db.write();
  }
  return order;
}

export async function markOutForDelivery(orderId) {
  if (isSupabaseConfigured()) {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.from('orders').update({ status: 'out_for_delivery', updated_at: new Date().toISOString() }).eq('id', orderId).select('*').maybeSingle()
    if (error) throw new Error(error.message)
    return data ? { id: data.id, userId: data.user_id, status: data.status, createdAt: data.created_at } : null
  }
  await initDb();
  const order = db.data.orders.find(o => o.id === orderId);
  if (order) {
    order.status = 'out_for_delivery';
    order.outForDeliveryAt = new Date().toISOString();
    await db.write();
  }
  return order;
}

export async function markDelivered(orderId) {
  if (isSupabaseConfigured()) {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.from('orders').update({ status: 'delivered', updated_at: new Date().toISOString() }).eq('id', orderId).select('*').maybeSingle()
    if (error) throw new Error(error.message)
    return data ? { id: data.id, userId: data.user_id, status: data.status, createdAt: data.created_at } : null
  }
  await initDb();
  const order = db.data.orders.find(o => o.id === orderId);
  if (order) {
    order.status = 'delivered';
    order.deliveredAt = new Date().toISOString();
    await db.write();
  }
  return order;
}

export async function markAccepted(orderId) {
  if (isSupabaseConfigured()) {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.from('orders').update({ status: 'accepted', updated_at: new Date().toISOString() }).eq('id', orderId).select('*').maybeSingle()
    if (error) throw new Error(error.message)
    return data ? { id: data.id, userId: data.user_id, status: data.status, createdAt: data.created_at } : null
  }
  await initDb();
  const order = db.data.orders.find(o => o.id === orderId);
  if (order) {
    order.status = 'accepted';
    order.acceptedAt = new Date().toISOString();
    await db.write();
  }
  return order;
}

export async function confirmOrder(orderId, distributorId, distributorName) {
  if (isSupabaseConfigured()) {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.from('orders').update({ status: 'confirmed', updated_at: new Date().toISOString() }).eq('id', orderId).select('*').maybeSingle()
    if (error) throw new Error(error.message)
    return data ? { id: data.id, userId: data.user_id, status: data.status, createdAt: data.created_at } : null
  }
  await initDb();
  const order = db.data.orders.find(o => o.id === orderId);
  if (order) {
    order.status = 'confirmed';
    order.confirmedAt = new Date().toISOString();
    if (distributorId) order.distributorId = distributorId;
    if (distributorName) order.distributorName = distributorName;
    await db.write();
  }
  return order;
}

// Get all orders for a distributor
export async function getOrdersByDistributor(distributorId) {
  if (isSupabaseConfigured()) {
    const sb = getSupabaseAdmin()
    // Scope by distributor's products.
    // 1) Get product IDs owned by distributor
    const { data: prods, error: pErr } = await sb
      .from('products')
      .select('id')
      .eq('owner_user_id', distributorId)
    if (pErr) throw new Error(pErr.message)
    const productIds = (prods || []).map(p => p.id)
    if (!productIds.length) return []

    // 2) Get order items that reference those product IDs
    const { data: items, error: iErr } = await sb
      .from('order_items')
      .select('order_id, product_id, quantity, unit_price')
      .in('product_id', productIds)
    if (iErr) throw new Error(iErr.message)
    if (!items || !items.length) return []

    // 3) Collect order IDs and fetch those orders
    const orderIds = Array.from(new Set(items.map(it => it.order_id)))
    if (!orderIds.length) return []
    const { data: orders, error: oErr } = await sb
      .from('orders')
      .select('*')
      .in('id', orderIds)
      .order('created_at', { ascending: false })
    if (oErr) throw new Error(oErr.message)

    // 4) Attach items to their orders
    const itemsByOrder = new Map()
    for (const it of items) {
      const arr = itemsByOrder.get(it.order_id) || []
      arr.push({ productId: it.product_id, qty: Number(it.quantity || 0), price: Number(it.unit_price || 0) })
      itemsByOrder.set(it.order_id, arr)
    }

    return (orders || []).map(o => ({
      id: o.id,
      userId: o.user_id,
      items: itemsByOrder.get(o.id) || [],
      status: o.status,
      createdAt: o.created_at,
    }))
  }
  await initDb();
  return db.data.orders.filter(o => o.distributorId === distributorId);
}
