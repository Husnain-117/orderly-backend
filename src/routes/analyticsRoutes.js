import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { distributorSummary, distributorTopProducts, distributorTopShops, shopMonthlySummary, shopFrequentItems } from '../controllers/analyticsController.js';

const router = Router();
router.use(requireAuth);

// Distributor analytics
router.get('/distributor/summary', distributorSummary);
router.get('/distributor/top-products', distributorTopProducts);
router.get('/distributor/top-shops', distributorTopShops);

// Shopkeeper analytics
router.get('/shop/summary', shopMonthlySummary);
router.get('/shop/frequent-items', shopFrequentItems);

export default router;
