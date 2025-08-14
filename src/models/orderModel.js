import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, '../../data');
const dbFile = path.join(dataDir, 'db.json');

const defaultData = { orders: [] };

let db;

export async function initDb() {
  if (!db) {
    fs.mkdirSync(dataDir, { recursive: true });
    db = new Low(new JSONFile(dbFile), defaultData);
    await db.read();
    db.data ||= { ...defaultData };
    db.data.orders ||= [];
    await db.write();
  }
  return db;
}

export async function createOrder({ userId, items, distributorId, distributorName, shopName }) {
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
  };
  db.data.orders.push(order);
  await db.write();
  return order;
}

export async function getOrdersByUser(userId) {
  await initDb();
  return db.data.orders.filter(o => o.userId === userId);
}

export async function updateOrderItems(orderId, items) {
  await initDb();
  const order = db.data.orders.find(o => o.id === orderId);
  if (order && order.status === 'pending') {
    order.items = items;
    await db.write();
    return order;
  }
  return null;
}

export async function removeOrder(orderId, userId) {
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
  await initDb();
  return db.data.orders.filter(o => o.distributorId === distributorId);
}
