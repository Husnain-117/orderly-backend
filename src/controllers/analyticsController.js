import { requireAuth } from '../lib/auth.js';
import { getOrdersByDistributor, getOrdersByUser } from '../models/orderModel.js';
import { findUserById } from '../models/userModel.js';

// Helper: parse range like '7d','30d','90d' => days
function parseRange(range) {
  const m = String(range || '30d').match(/(\d+)d/);
  const days = m ? parseInt(m[1], 10) : 30;
  return Math.max(1, Math.min(days, 365));
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function formatDay(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

function inStatuses(o) {
  const s = String(o.status || '').toLowerCase();
  return ['accepted', 'placed', 'out_for_delivery', 'delivered'].includes(s);
}

function normalizeDate(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  if (isNaN(d.getTime())) return new Date();
  return d;
}

// Distributor: summary trend + totals
export async function distributorSummary(req, res) {
  try {
    if ((req.user.role || '').toLowerCase() !== 'distributor') {
      return res.status(403).json({ error: 'forbidden' });
    }
    const days = parseRange(req.query.range);
    const end = startOfDay(new Date());
    const start = new Date(end);
    start.setDate(end.getDate() - (days - 1));

    const all = await getOrdersByDistributor(req.user.id);
    const filtered = all.filter((o) => inStatuses(o) && normalizeDate(o.createdAt) >= start && normalizeDate(o.createdAt) <= new Date(end.getTime() + 86399999));

    // Build daily buckets
    const buckets = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      buckets[formatDay(d)] = { date: formatDay(d), orders: 0, items: 0, revenue: 0 };
    }

    let totalOrders = 0, totalItems = 0, totalRevenue = 0;
    filtered.forEach((o) => {
      const day = formatDay(normalizeDate(o.createdAt));
      const bucket = buckets[day];
      if (!bucket) return;
      const itemsCount = Array.isArray(o.items) ? o.items.reduce((n, it) => n + Number(it.qty || 0), 0) : 0;
      const revenue = typeof o.total === 'number' ? o.total : (Array.isArray(o.items) ? o.items.reduce((sum, it) => sum + Number(it.qty || 0) * Number(it.price || 0), 0) : 0);
      bucket.orders += 1;
      bucket.items += itemsCount;
      bucket.revenue += revenue;
      totalOrders += 1;
      totalItems += itemsCount;
      totalRevenue += revenue;
    });

    const trend = Object.values(buckets);
    const aov = totalOrders ? totalRevenue / totalOrders : 0;

    return res.json({ ok: true, rangeDays: days, totals: { orders: totalOrders, items: totalItems, revenue: totalRevenue, avgOrderValue: aov }, trend });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'failed to build distributor summary' });
  }
}

// Distributor: top products
export async function distributorTopProducts(req, res) {
  try {
    if ((req.user.role || '').toLowerCase() !== 'distributor') {
      return res.status(403).json({ error: 'forbidden' });
    }
    const days = parseRange(req.query.range);
    const limit = Math.max(1, Math.min(parseInt(String(req.query.limit || 10), 10) || 10, 50));
    const end = startOfDay(new Date());
    const start = new Date(end);
    start.setDate(end.getDate() - (days - 1));

    const all = await getOrdersByDistributor(req.user.id);
    const filtered = all.filter((o) => inStatuses(o) && normalizeDate(o.createdAt) >= start && normalizeDate(o.createdAt) <= new Date(end.getTime() + 86399999));
    const map = new Map();
    for (const o of filtered) {
      for (const it of o.items || []) {
        const key = it.productId || it.sku || it.name || 'unknown';
        const prev = map.get(key) || { productId: key, name: it.name || String(key), qty: 0, revenue: 0 };
        const qty = Number(it.qty || 0);
        const price = Number(it.price || 0);
        prev.qty += qty;
        prev.revenue += qty * price;
        map.set(key, prev);
      }
    }
    const list = Array.from(map.values()).sort((a, b) => b.qty - a.qty).slice(0, limit);
    return res.json({ ok: true, items: list });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'failed to build top products' });
  }
}

// Distributor: top shopkeepers
export async function distributorTopShops(req, res) {
  try {
    if ((req.user.role || '').toLowerCase() !== 'distributor') {
      return res.status(403).json({ error: 'forbidden' });
    }
    const days = parseRange(req.query.range);
    const limit = Math.max(1, Math.min(parseInt(String(req.query.limit || 10), 10) || 10, 50));
    const end = startOfDay(new Date());
    const start = new Date(end);
    start.setDate(end.getDate() - (days - 1));

    const all = await getOrdersByDistributor(req.user.id);
    const filtered = all.filter((o) => inStatuses(o) && normalizeDate(o.createdAt) >= start && normalizeDate(o.createdAt) <= new Date(end.getTime() + 86399999));

    const map = new Map();
    for (const o of filtered) {
      const key = o.userId || o.shopId || 'unknown';
      const prev = map.get(key) || { shopId: key, name: o.shopName || o.userName || key, orders: 0, revenue: 0 };
      const revenue = typeof o.total === 'number' ? o.total : (Array.isArray(o.items) ? o.items.reduce((sum, it) => sum + Number(it.qty || 0) * Number(it.price || 0), 0) : 0);
      prev.orders += 1;
      prev.revenue += revenue;
      map.set(key, prev);
    }
    const list = Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, limit);
    return res.json({ ok: true, shops: list });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'failed to build top shops' });
  }
}

// Shopkeeper: monthly summary
export async function shopMonthlySummary(req, res) {
  try {
    const role = (req.user.role || '').toLowerCase();
    if (!['shopkeeper', 'salesperson'].includes(role)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const monthStr = String(req.query.month || ''); // YYYY-MM
    const now = new Date();
    const [yr, mo] = monthStr.match(/^\d{4}-\d{2}$/) ? monthStr.split('-').map((n) => parseInt(n, 10)) : [now.getFullYear(), now.getMonth() + 1];
    const start = new Date(yr, mo - 1, 1);
    const end = new Date(yr, mo, 0); // last day of month
    end.setHours(23, 59, 59, 999);

    const all = await getOrdersByUser(req.user.id);
    const filtered = all.filter((o) => inStatuses(o) && normalizeDate(o.createdAt) >= start && normalizeDate(o.createdAt) <= end);

    // daily buckets
    const daysInMonth = end.getDate();
    const buckets = {};
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(yr, mo - 1, d);
      buckets[formatDay(dt)] = { date: formatDay(dt), orders: 0, items: 0, spend: 0 };
    }

    let totalOrders = 0, totalItems = 0, totalSpend = 0;
    filtered.forEach((o) => {
      const day = formatDay(normalizeDate(o.createdAt));
      const bucket = buckets[day];
      if (!bucket) return;
      const itemsCount = Array.isArray(o.items) ? o.items.reduce((n, it) => n + Number(it.qty || 0), 0) : 0;
      const spend = typeof o.total === 'number' ? o.total : (Array.isArray(o.items) ? o.items.reduce((sum, it) => sum + Number(it.qty || 0) * Number(it.price || 0), 0) : 0);
      bucket.orders += 1;
      bucket.items += itemsCount;
      bucket.spend += spend;
      totalOrders += 1;
      totalItems += itemsCount;
      totalSpend += spend;
    });

    const trend = Object.values(buckets);
    const aov = totalOrders ? totalSpend / totalOrders : 0;
    return res.json({ ok: true, month: `${yr}-${String(mo).padStart(2, '0')}`, totals: { orders: totalOrders, items: totalItems, spend: totalSpend, avgOrderValue: aov }, trend });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'failed to build monthly summary' });
  }
}

// Shopkeeper: frequent items in last N months
export async function shopFrequentItems(req, res) {
  try {
    const role = (req.user.role || '').toLowerCase();
    if (!['shopkeeper', 'salesperson'].includes(role)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const months = Math.max(1, Math.min(parseInt(String(req.query.months || 3), 10) || 3, 12));
    const limit = Math.max(1, Math.min(parseInt(String(req.query.limit || 10), 10) || 10, 50));
    const end = new Date();
    const start = new Date(end);
    start.setMonth(end.getMonth() - (months - 1));
    start.setDate(1);
    start.setHours(0, 0, 0, 0);

    const all = await getOrdersByUser(req.user.id);
    const filtered = all.filter((o) => inStatuses(o) && normalizeDate(o.createdAt) >= start && normalizeDate(o.createdAt) <= end);

    const map = new Map();
    for (const o of filtered) {
      for (const it of o.items || []) {
        const key = it.productId || it.sku || it.name || 'unknown';
        const prev = map.get(key) || { productId: key, name: it.name || String(key), count: 0, qty: 0, spend: 0 };
        const qty = Number(it.qty || 0);
        const price = Number(it.price || 0);
        prev.count += 1;
        prev.qty += qty;
        prev.spend += qty * price;
        map.set(key, prev);
      }
    }
    const list = Array.from(map.values()).sort((a, b) => b.qty - a.qty).slice(0, limit);
    return res.json({ ok: true, items: list });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'failed to build frequent items' });
  }
}
