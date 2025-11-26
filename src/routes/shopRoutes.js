import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { listFollowsForUser, followDistributor, unfollowDistributor } from '../models/userModel.js';

const router = Router();

// List followed distributors for current user (shopkeeper or salesperson)
router.get('/follows', requireAuth, async (req, res) => {
  try {
    const role = String(req.user.role || '').toLowerCase();
    if (!['shopkeeper', 'salesperson'].includes(role)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const items = await listFollowsForUser(req.user.id);
    return res.json({ ok: true, follows: items });
  } catch (e) {
    return res.status(400).json({ error: e?.message || 'failed to list follows' });
  }
});

// Follow a distributor
router.post('/follows', requireAuth, async (req, res) => {
  try {
    const role = String(req.user.role || '').toLowerCase();
    if (!['shopkeeper', 'salesperson'].includes(role)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const { distributorId } = req.body || {};
    if (!distributorId) return res.status(400).json({ error: 'distributorId required' });
    const rec = await followDistributor(req.user.id, distributorId);
    return res.json({ ok: true, follow: rec });
  } catch (e) {
    return res.status(400).json({ error: e?.message || 'failed to follow' });
  }
});

// Unfollow a distributor
router.delete('/follows/:distributorId', requireAuth, async (req, res) => {
  try {
    const role = String(req.user.role || '').toLowerCase();
    if (!['shopkeeper', 'salesperson'].includes(role)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const { distributorId } = req.params;
    if (!distributorId) return res.status(400).json({ error: 'distributorId required' });
    await unfollowDistributor(req.user.id, distributorId);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(400).json({ error: e?.message || 'failed to unfollow' });
  }
});

export default router;
