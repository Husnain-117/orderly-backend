import { createOrder, getOrdersByUser, confirmOrder, updateOrderItems, removeOrder } from '../models/orderModel.js';
import { markPlaced, markOutForDelivery, markAccepted, getOrdersByDistributor, markDelivered } from '../models/orderModel.js';
import { getProductById, updateProduct } from '../models/productModel.js';
import { findUserByEmail, findUserById } from '../models/userModel.js';
import { sendOrderReceivedEmail } from '../lib/mailer.js';

// Add to cart (simply creates a pending order)
export async function addToCart(req, res) {
  try {
    const { items } = req.body; // [{ productId, qty }]
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array required' });
    }
    // Optionally, validate product IDs and qty here
    const detailedItems = [];
    let distributorId = null, distributorName = null, shopName = null;
    // Fetch user/shop info
    const user = req.user;
    if (user && user.email) {
      const userObj = await findUserByEmail(user.email);
      shopName = userObj?.organizationName || userObj?.email || null;
    }
    for (const it of items) {
      const product = await getProductById(it.productId);
      if (!product) return res.status(404).json({ error: `Product not found: ${it.productId}` });
      detailedItems.push({
        productId: product.id,
        name: product.name,
        price: product.price,
        qty: it.qty,
        image: product.image || null, // Include product image if available
        shopName, // Attach shop name to each item
      });
      // Assume all items in one order are from the same distributor (ownerId)
      if (!distributorId) {
        distributorId = product.ownerId;
        distributorName = product.distributor || product.distributorName || '';
      }
    }
    const order = await createOrder({ userId: req.user.id, items: detailedItems, distributorId, distributorName, shopName });
    return res.status(201).json({ ok: true, order });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'failed to add to cart' });
  }
}

// Mark order as delivered
export async function markOrderDelivered(req, res) {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ error: 'orderId required' });
    // Ensure the order belongs to the current distributor and is in out_for_delivery status
    const distributorOrders = await getOrdersByDistributor(req.user.id);
    const existing = distributorOrders.find(o => o.id === orderId);
    if (!existing) return res.status(404).json({ error: 'Order not found for this distributor' });
    if (existing.status !== 'out_for_delivery') return res.status(400).json({ error: 'Only orders out for delivery can be marked as delivered' });

    const order = await markDelivered(orderId);
    // Notify shopkeeper by email
    try {
      if (order && order.userId) {
        const shopUser = await findUserById(order.userId);
        if (shopUser && shopUser.email) {
          await sendOrderReceivedEmail(shopUser.email, {
            orderId: order.id,
            shopName: order.shopName,
            items: order.items,
            status: 'delivered',
          });
          console.log(`📦 Sent 'Delivered' email to shopkeeper: ${shopUser.email}`);
        }
      }
    } catch (emailErr) {
      console.warn('Failed to send shopkeeper delivered email:', emailErr?.message || emailErr);
    }
    return res.json({ ok: true, message: 'Order marked as delivered.' });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'failed to mark order delivered' });
  }
}

// Update items in a pending order
export async function updateCartOrder(req, res) {
  try {
    const { orderId, items } = req.body;
    if (!orderId || !Array.isArray(items)) return res.status(400).json({ error: 'orderId and items required' });
    const order = await updateOrderItems(orderId, items);
    if (!order) return res.status(404).json({ error: 'Order not found or not pending' });
    return res.json({ ok: true, order });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'failed to update order' });
  }
}

// Remove a pending order
export async function removeCartOrder(req, res) {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ error: 'orderId required' });
    const ok = await removeOrder(orderId, req.user.id);
    if (!ok) return res.status(404).json({ error: 'Order not found or not pending' });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'failed to remove order' });
  }
}

// Mark order as placed
export async function markOrderPlaced(req, res) {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ error: 'orderId required' });
    // Ensure the order belongs to the current distributor and is in accepted status
    const distributorOrders = await getOrdersByDistributor(req.user.id);
    const existing = distributorOrders.find(o => o.id === orderId);
    if (!existing) return res.status(404).json({ error: 'Order not found for this distributor' });
    if (existing.status !== 'accepted') return res.status(400).json({ error: 'Only accepted orders can be marked as placed' });

    const order = await markPlaced(orderId);
    // Notify shopkeeper by email
    try {
      if (order && order.userId) {
        const shopUser = await findUserById(order.userId);
        if (shopUser && shopUser.email) {
          await sendOrderReceivedEmail(shopUser.email, {
            orderId: order.id,
            shopName: order.shopName,
            items: order.items,
            status: 'placed',
          });
          console.log(`✅ Sent 'Order Placed' email to shopkeeper: ${shopUser.email}`);
        }
      }
    } catch (emailErr) {
      console.warn('Failed to send shopkeeper placed email:', emailErr?.message || emailErr);
    }
    return res.json({ ok: true, message: 'Order marked as placed.' });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'failed to mark order placed' });
  }
}

// Mark order as out for delivery
export async function markOrderOutForDelivery(req, res) {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ error: 'orderId required' });
    // Ensure the order belongs to the current distributor and is in placed status
    const distributorOrders = await getOrdersByDistributor(req.user.id);
    const existing = distributorOrders.find(o => o.id === orderId);
    if (!existing) return res.status(404).json({ error: 'Order not found for this distributor' });
    if (existing.status !== 'placed') return res.status(400).json({ error: 'Only placed orders can be marked as out for delivery' });

    const order = await markOutForDelivery(orderId);
    // Notify shopkeeper by email
    try {
      if (order && order.userId) {
        const shopUser = await findUserById(order.userId);
        if (shopUser && shopUser.email) {
          await sendOrderReceivedEmail(shopUser.email, {
            orderId: order.id,
            shopName: order.shopName,
            items: order.items,
            status: 'out_for_delivery',
          });
          console.log(`🚚 Sent 'Out for Delivery' email to shopkeeper: ${shopUser.email}`);
        }
      }
    } catch (emailErr) {
      console.warn('Failed to send shopkeeper out for delivery email:', emailErr?.message || emailErr);
    }
    return res.json({ ok: true, message: 'Order marked as out for delivery.' });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'failed to mark order out for delivery' });
  }
}

// Confirm order by shopkeeper (sends to distributor for approval)
export async function confirmOrderAndDecreaseStock(req, res) {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ error: 'orderId required' });
    
    // Find the order and validate it belongs to the current user
    const userOrders = await getOrdersByUser(req.user.id);
    const order = userOrders.find(o => o.id === orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'pending') return res.status(400).json({ error: 'Order is not pending' });

    // Get distributor info from order's first item
    let distributorId = null, distributorName = null;
    if (order.items && order.items.length > 0) {
      const product = await getProductById(order.items[0].productId);
      if (product) {
        distributorId = product.ownerId;
        distributorName = product.distributor || product.distributorName || '';
      }
    }

    // Update order to confirmed status and set distributor info
    const confirmedOrder = await confirmOrder(orderId, distributorId, distributorName);
    if (!confirmedOrder) return res.status(404).json({ error: 'Failed to confirm order' });

    // Notify ONLY the distributor by email when order is confirmed by shopkeeper
    try {
      if (distributorId) {
        const distributorUser = await findUserById(distributorId);
        if (distributorUser?.email) {
          await sendOrderReceivedEmail(distributorUser.email, {
            orderId: confirmedOrder.id,
            shopName: confirmedOrder.shopName,
            items: confirmedOrder.items,
            status: 'new_order', // Changed from 'confirmed' to be more descriptive
            distributorEmail: distributorUser.email,
            distributorName: distributorUser.organizationName || distributorUser.name || 'Distributor'
          });
          console.log(`📧 Sent NEW ORDER notification to distributor: ${distributorUser.email}`);
        }
      }
    } catch (emailErr) {
      console.warn('Failed to send new order email to distributor:', emailErr?.message || emailErr);
    }

    return res.json({ 
      ok: true, 
      message: 'Order confirmed and sent to distributor! You will receive updates via email.' 
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'failed to confirm order' });
  }
}

// New function: Distributor accepts order and decreases stock
export async function acceptOrderAndDecreaseStock(req, res) {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ error: 'orderId required' });
    
    // Find order for this distributor
    const distributorOrders = await getOrdersByDistributor(req.user.id);
    const order = distributorOrders.find(o => o.id === orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'confirmed') return res.status(400).json({ error: 'Order is not confirmed' });

    // Check and decrease stock for each item
    for (const item of order.items) {
      const product = await getProductById(item.productId);
      if (!product) return res.status(404).json({ error: `Product not found: ${item.productId}` });
      if (product.stock < item.qty) {
        return res.status(400).json({ error: `Insufficient stock for ${product.name}. Available: ${product.stock}, Requested: ${item.qty}` });
      }
    }

    // Decrease stock
    for (const item of order.items) {
      const product = await getProductById(item.productId);
      await updateProduct(product.id, { stock: product.stock - item.qty });
    }

    // Mark order as accepted
    const acceptedOrder = await markAccepted(orderId);
    if (!acceptedOrder) return res.status(500).json({ error: 'Failed to accept order' });

    // Notify shopkeeper by email when distributor accepts the order
    try {
      const distributorUser = await findUserById(req.user.id); // Get current distributor's info
      if (acceptedOrder.userId) {
        const shopUser = await findUserById(acceptedOrder.userId);
        if (shopUser?.email) {
          await sendOrderReceivedEmail(shopUser.email, {
            orderId: acceptedOrder.id,
            shopName: acceptedOrder.shopName,
            items: acceptedOrder.items,
            status: 'accepted',
            fromEmail: distributorUser.email, // Include distributor's email
            fromName: distributorUser.organizationName || distributorUser.name || 'Your Distributor',
            distributorName: distributorUser.organizationName || distributorUser.name || 'Your Distributor'
          });
          console.log(`✅ Sent order acceptance email to shopkeeper: ${shopUser.email} from distributor: ${distributorUser.email}`);
        }
      }
    } catch (emailErr) {
      console.warn('Failed to send shopkeeper acceptance email:', emailErr?.message || emailErr);
    }

    return res.json({ 
      ok: true, 
      message: 'Order accepted! Stock decreased and shopkeeper notified.' 
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'failed to accept order' });
  }
}

// Get all orders for a distributor
export async function getOrdersForDistributor(req, res) {
  try {
    const { distributorId } = req.params;
    if (!distributorId) return res.status(400).json({ error: 'distributorId required' });
    const orders = await getOrdersByDistributor(distributorId);
    console.log(`[DEBUG] Found ${orders.length} orders for distributor ${distributorId}:`, JSON.stringify(orders, null, 2));
    return res.json({ ok: true, orders });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'failed to get distributor orders' });
  }
}

// Get orders for current user
export async function getMyOrders(req, res) {
  try {
    const orders = await getOrdersByUser(req.user.id);
    return res.json({ ok: true, orders });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'failed to get orders' });
  }
}

// Get orders for the currently authenticated distributor, with optional filters
export async function getOrdersForCurrentDistributor(req, res) {
  try {
    const distributorId = req.user.id;
    let orders = await getOrdersByDistributor(distributorId);

    // Optional filters: status, search, sort, pagination
    const { status, q, sort = 'createdAt_desc', limit, offset } = req.query || {};

    if (status) {
      const norm = String(status).toLowerCase();
      orders = orders.filter(o => String(o.status).toLowerCase() === norm);
    }
    if (q) {
      const needle = String(q).toLowerCase();
      orders = orders.filter(o => {
        const idStr = String(o.id || '').toLowerCase();
        const shop = String(o.shopName || o.userId || '').toLowerCase();
        return idStr.includes(needle) || shop.includes(needle);
      });
    }

    // Sort
    const [field, dir] = String(sort).split('_');
    const desc = dir !== 'asc';
    orders.sort((a, b) => {
      const getDate = (x) => new Date(x?.createdAt || x?.placedAt || x?.outForDeliveryAt || x?.confirmedAt || x?.acceptedAt || x?.deliveredAt || 0).getTime();
      if (field === 'createdAt') return (getDate(b) - getDate(a)) * (desc ? 1 : -1);
      return (getDate(b) - getDate(a)) * (desc ? 1 : -1);
    });

    // Pagination
    let start = 0, end = orders.length;
    if (typeof limit !== 'undefined' || typeof offset !== 'undefined') {
      const lim = Math.max(0, parseInt(String(limit || '20'), 10));
      const off = Math.max(0, parseInt(String(offset || '0'), 10));
      start = off;
      end = off + lim;
    }
    const paged = orders.slice(start, end);
    return res.json({ ok: true, total: orders.length, orders: paged });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'failed to get distributor orders' });
  }
}
