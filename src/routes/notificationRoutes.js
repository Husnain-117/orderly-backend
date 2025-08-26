import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { getMyNotifications, markNotificationRead, markNotificationUnread, markAllNotificationsRead, createTestNotification, clearAllNotifications } from '../controllers/notificationController.js';

const router = Router();

router.use(requireAuth);

// List current user's notifications (optional ?unread=true)
router.get('/', getMyNotifications);

// Mark one as read/unread
router.post('/:id/read', markNotificationRead);
router.post('/:id/unread', markNotificationUnread);

// Mark all as read
router.post('/mark-all-read', markAllNotificationsRead);

// Clear all notifications
router.delete('/clear', clearAllNotifications);

// Debug: create a test notification for current user
router.post('/test', createTestNotification);

export default router;
