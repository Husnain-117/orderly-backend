import express from 'express'
import { requireAuth, requireDistributor } from '../lib/auth.js'
import {
  getSalespersonLinkStatus,
  approveSalespersonLinkRequest,
  rejectSalespersonLinkRequest,
  listLinkedSalespersonsForDistributor,
} from '../models/userModel.js'

const router = express.Router()

// Returns { linked: boolean, distributorId?: string, requestId?: string }
router.get('/salesperson/link-status', requireAuth, async (req, res) => {
  try {
    const user = req.user
    if (!user) return res.status(401).json({ ok: false, error: 'unauthenticated' })
    if (user.role !== 'salesperson') return res.status(403).json({ ok: false, error: 'forbidden' })
    const status = await getSalespersonLinkStatus(user.id)
    const linked = status.state === 'approved'
    return res.json({ ok: true, linked, distributorId: status.distributorId || null, requestId: status.requestId || null })
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'error' })
  }
})

// Distributor approves a specific request
router.post('/distributor/links/:requestId/approve', requireAuth, requireDistributor, async (req, res) => {
  try {
    const user = req.user
    if (!user) return res.status(401).json({ ok: false, error: 'unauthenticated' })
    if (user.role !== 'distributor') return res.status(403).json({ ok: false, error: 'forbidden' })
    const { requestId } = req.params
    const result = await approveSalespersonLinkRequest(requestId, user.id)
    return res.json({ ok: true, link: result })
  } catch (e) {
    return res.status(400).json({ ok: false, error: e?.message || 'error' })
  }
})

// Distributor rejects a specific request
router.post('/distributor/links/:requestId/reject', requireAuth, requireDistributor, async (req, res) => {
  try {
    const user = req.user
    if (!user) return res.status(401).json({ ok: false, error: 'unauthenticated' })
    if (user.role !== 'distributor') return res.status(403).json({ ok: false, error: 'forbidden' })
    const { requestId } = req.params
    const result = await rejectSalespersonLinkRequest(requestId, user.id)
    return res.json({ ok: true, link: result })
  } catch (e) {
    return res.status(400).json({ ok: false, error: e?.message || 'error' })
  }
})

// Distributor lists currently linked salespersons (approved latest state)
router.get('/distributor/linked-salespersons', requireAuth, requireDistributor, async (req, res) => {
  try {
    const user = req.user
    if (!user) return res.status(401).json({ ok: false, error: 'unauthenticated' })
    if (user.role !== 'distributor') return res.status(403).json({ ok: false, error: 'forbidden' })
    const list = await listLinkedSalespersonsForDistributor(user.id)
    return res.json({ ok: true, salespersons: list })
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'error' })
  }
})

export default router
