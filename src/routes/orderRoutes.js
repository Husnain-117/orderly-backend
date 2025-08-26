import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { addToCart, updateCartOrder, removeCartOrder, confirmOrderAndDecreaseStock, acceptOrderAndDecreaseStock, getOrdersForDistributor, getMyOrders, markOrderPlaced, markOrderOutForDelivery, markOrderDelivered, getOrdersForCurrentDistributor, getInvoiceHtml, getInvoicePdf, sendInvoiceEmail } from '../controllers/orderController.js';

const router = Router();

router.use(requireAuth);

// Add to cart (creates a pending order)
router.post('/cart', requireAuth, addToCart);
router.put('/cart', requireAuth, updateCartOrder);
router.delete('/cart', requireAuth, removeCartOrder);

// Confirm order (decreases stock, sets status)
router.post('/confirm', requireAuth, confirmOrderAndDecreaseStock);
router.post('/accept', requireAuth, acceptOrderAndDecreaseStock);
router.post('/mark-placed', requireAuth, markOrderPlaced);
router.post('/mark-out-for-delivery', requireAuth, markOrderOutForDelivery);
router.post('/mark-delivered', requireAuth, markOrderDelivered);

// Invoice generation and emailing
router.get('/invoice/:orderId', requireAuth, getInvoiceHtml);
router.get('/invoice/:orderId/pdf', requireAuth, getInvoicePdf);
router.post('/invoice/:orderId/send', requireAuth, sendInvoiceEmail);

// Get all orders for the current user
router.get('/my', getMyOrders);

// Get all orders for a distributor
router.get('/for-distributor/:distributorId', getOrdersForDistributor);
router.get('/for-distributor', requireAuth, getOrdersForCurrentDistributor);

export default router;
