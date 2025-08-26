import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createDb } from '../lib/dbAdapter.js';
import { getSupabaseAdmin, isSupabaseConfigured } from '../lib/supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, '../../data');
const dbFile = path.join(dataDir, 'db.json');

const defaultData = { notifications: [] };
let db;
let initialized = false;

export async function initDb() {
  if (initialized) return db;
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch {}
  const created = await createDb(dbFile, defaultData);
  db = created.db;
  db.data ||= { ...defaultData };
  db.data.notifications ||= [];
  await db.write();
  initialized = true;
  return db;
}

// Create a notification (and return it)
export async function createNotification({ userId, type, title, message, data }) {
  const now = new Date().toISOString();
  const notif = {
    id: crypto.randomUUID(),
    userId,
    type: String(type || 'info'),
    title: String(title || ''),
    message: String(message || ''),
    data: data || null,
    read: false,
    createdAt: now,
  };

  if (isSupabaseConfigured()) {
    try {
      const sb = getSupabaseAdmin();
      const { error } = await sb.from('notifications').insert({
        id: notif.id,
        user_id: notif.userId,
        type: notif.type,
        title: notif.title,
        message: notif.message,
        data: notif.data,
        read: notif.read,
        created_at: now,
      });
      if (error) throw new Error(error.message);
      return notif;
    } catch (e) {
      // fallback to file DB if Supabase table not present
    }
  }

  await initDb();
  db.data.notifications.push(notif);
  await db.write();
  return notif;
}

export async function listNotifications(userId, { unread } = {}) {
  // Collect from Supabase if configured
  let supaItems = [];
  if (isSupabaseConfigured()) {
    try {
      const sb = getSupabaseAdmin();
      let query = sb.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false });
      if (unread === true) query = query.eq('read', false);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      supaItems = (data || []).map((n) => ({
        id: n.id,
        userId: n.user_id,
        type: n.type,
        title: n.title,
        message: n.message,
        data: n.data,
        read: n.read,
        createdAt: n.created_at,
      }));
    } catch (e) {
      // ignore and rely on file DB below
    }
  }

  // Collect from file DB
  await initDb();
  let fileItems = (db.data.notifications || []).filter((n) => n.userId === userId);

  // Apply unread filter consistently (only when unread === true)
  if (unread === true) {
    fileItems = fileItems.filter((n) => !n.read);
  }

  // Merge and dedupe by id
  const mergedMap = new Map();
  for (const n of [...supaItems, ...fileItems]) {
    if (!mergedMap.has(n.id)) mergedMap.set(n.id, n);
  }
  const merged = Array.from(mergedMap.values());

  // Sort by createdAt desc
  merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return merged;
}

export async function setNotificationRead(id, userId, read = true) {
  if (isSupabaseConfigured()) {
    try {
      const sb = getSupabaseAdmin();
      const { data, error } = await sb
        .from('notifications')
        .update({ read, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId)
        .select('*')
        .maybeSingle();
      if (error) throw new Error(error.message);
      return !!data;
    } catch (e) {
      // fall back
    }
  }
  await initDb();
  const n = (db.data.notifications || []).find((x) => x.id === id && x.userId === userId);
  if (!n) return false;
  n.read = read;
  await db.write();
  return true;
}

// Remove all notifications for a user
export async function clearAll(userId) {
  if (isSupabaseConfigured()) {
    try {
      const sb = getSupabaseAdmin();
      const { error } = await sb
        .from('notifications')
        .delete()
        .eq('user_id', userId);
      if (error) throw new Error(error.message);
      // continue to attempt clearing file DB too, to keep stores consistent
    } catch (e) {
      // fall back to file DB below
    }
  }
  await initDb();
  db.data.notifications = (db.data.notifications || []).filter((n) => n.userId !== userId);
  await db.write();
  return true;
}

export async function markAllRead(userId) {
  if (isSupabaseConfigured()) {
    try {
      const sb = getSupabaseAdmin();
      const { error } = await sb
        .from('notifications')
        .update({ read: true, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('read', false);
      if (error) throw new Error(error.message);
      return true;
    } catch (e) {
      // fall back
    }
  }
  await initDb();
  for (const n of db.data.notifications || []) {
    if (n.userId === userId) n.read = true;
  }
  await db.write();
  return true;
}
