import { listNotifications, setNotificationRead, markAllRead, clearAll } from '../models/notificationModel.js';
import { createNotification } from '../models/notificationModel.js';

export async function getMyNotifications(req, res) {
  try {
    const { unread } = req.query || {};
    const items = await listNotifications(req.user.id, { unread: unread === 'true' });
    // minimal debug log
    // eslint-disable-next-line no-console
    console.log('[notifications] user', req.user.id, 'unread filter:', unread, 'count:', items.length);
    return res.json({ ok: true, notifications: items });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'failed to fetch notifications' });
  }
}

export async function clearAllNotifications(req, res) {
  try {
    await clearAll(req.user.id);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'failed to clear notifications' });
  }
}

export async function markNotificationRead(req, res) {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'id required' });
    const ok = await setNotificationRead(id, req.user.id, true);
    if (!ok) return res.status(404).json({ error: 'notification not found' });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'failed to mark as read' });
  }
}

export async function markNotificationUnread(req, res) {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'id required' });
    const ok = await setNotificationRead(id, req.user.id, false);
    if (!ok) return res.status(404).json({ error: 'notification not found' });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'failed to mark as unread' });
  }
}

export async function markAllNotificationsRead(req, res) {
  try {
    await markAllRead(req.user.id);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'failed to mark all as read' });
  }
}

// Debug/test: create a notification for the current user
export async function createTestNotification(req, res) {
  try {
    const n = await createNotification({
      userId: req.user.id,
      type: 'test',
      title: req.body?.title || 'Test Notification',
      message: req.body?.message || 'This is a test notification',
      data: { when: new Date().toISOString(), note: 'debug' },
    });
    return res.status(201).json({ ok: true, notification: n });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'failed to create test notification' });
  }
}
