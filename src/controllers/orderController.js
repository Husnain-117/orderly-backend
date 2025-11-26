import { createOrder, getOrdersByUser, confirmOrder, updateOrderItems, removeOrder } from '../models/orderModel.js';
import { markPlaced, markOutForDelivery, markAccepted, getOrdersByDistributor, markDelivered } from '../models/orderModel.js';
import { getProductById, updateProduct } from '../models/productModel.js';
import { findUserByEmail, findUserById } from '../models/userModel.js';
import { sendOrderReceivedEmail, transporter } from '../lib/mailer.js';
import { createNotification } from '../models/notificationModel.js';

// -------- Invoice helpers ---------
function formatCurrency(n) {
  const v = Number(n || 0);
  return `Rs${v.toFixed(2)}`;
}

// Theming for invoice (can be overridden via env)
function getInvoiceTheme() {
  const primary = process.env.INVOICE_PRIMARY_COLOR || '#10b981'; // emerald
  const dark = '#0f172a'; // slate-900
  const text = '#111827'; // gray-900
  const muted = '#6b7280'; // gray-500
  const border = '#e5e7eb'; // gray-200
  const surface = '#ffffff';
  const subtle = '#f8fafc'; // slate-50
  return { primary, dark, text, muted, border, surface, subtle };
}

// Generic: ensure items carry product name/price/description before persisting
async function enrichItemsWithProductDetails(items) {
  if (!Array.isArray(items)) return items;
  return Promise.all(
    items.map(async (it) => {
      const base = { ...it };
      if (base?.productId) {
        try {
          const p = await getProductById(base.productId);
          base.name = (base.name && String(base.name).trim()) ? base.name : (p?.name || '(Unnamed Product)');
          if (typeof base.price !== 'number') base.price = Number(p?.price || 0);
          if (base.description === undefined) base.description = p?.description || '';
        } catch {}
      } else {
        base.name = (base.name && String(base.name).trim()) ? base.name : '(Unnamed Product)';
      }
      base.qty = Number(base.qty || 0);
      return base;
    })
  );
}

function buildInvoiceHtml({ order, distributor, shop }) {
  const theme = getInvoiceTheme();
  const org = distributor?.organizationName || distributor?.name || 'Distributor';
  const brand = org;
  const shopName = order?.shopName || shop?.organizationName || shop?.name || shop?.email || 'Shop';
  const orderId = order?.id || '';
  const createdAt = new Date(order?.createdAt || Date.now()).toLocaleString();
  const lines = (order?.items || []).map((item, idx) => ({
    i: idx + 1,
    name: item.name,
    desc: item.description || '',
    qty: Number(item.qty || 0),
    price: Number(item.price || 0),
    total: Number(item.qty || 0) * Number(item.price || 0),
  }));
  const subtotal = lines.reduce((s, it) => s + it.total, 0);
  const taxRate = 0; // extend later if needed
  const tax = subtotal * taxRate;
  const grand = subtotal + tax;

  const rowsHtml = lines
    .map(
      (l) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${l.i}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">
        <div style="font-weight:600">${l.name}</div>
        ${l.desc ? `<div style="font-size:12px;color:#6b7280;">${l.desc}</div>` : ''}
      </td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">${l.qty}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatCurrency(l.price)}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatCurrency(l.total)}</td>
    </tr>
  `
    )
    .join('');

  return `
  <div style="font-family:Inter,Arial,sans-serif;max-width:860px;margin:0 auto;background:${theme.surface};border:1px solid ${theme.border};border-radius:12px;overflow:hidden">
    <div style="padding:20px 24px;border-bottom:1px solid ${theme.border};background:${theme.subtle}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px">
        <div>
          <div style="font-size:22px;font-weight:800;color:${theme.text}">${brand}</div>
          ${distributor?.email ? `<div style=\"margin-top:2px;font-size:12px;color:${theme.muted}\">${distributor.email}</div>` : ''}
          ${distributor?.address ? `<div style=\"font-size:12px;color:${theme.muted}\">${distributor.address}</div>` : ''}
        </div>
        <div style="text-align:right">
          <div style="font-size:24px;font-weight:800;color:${theme.primary}">SALES INVOICE</div>
          <div style="margin-top:6px;font-size:12px;color:${theme.muted}">Invoice #${orderId}</div>
          <div style="font-size:12px;color:${theme.muted}">${createdAt}</div>
          <div style="margin-top:6px;font-size:10px;color:${theme.muted}">Powered by <strong>Orderly</strong></div>
        </div>
      </div>
      <div style="display:flex;gap:24px;flex-wrap:wrap;margin-top:16px">
        <div style="flex:1;min-width:260px;background:#fff;border:1px solid ${theme.border};border-radius:8px;padding:12px 14px">
          <div style="font-size:11px;color:${theme.muted};text-transform:uppercase;letter-spacing:.4px">Bill To</div>
          <div style="font-weight:700;color:${theme.text}">${shopName}</div>
          ${shop?.email ? `<div style=\"font-size:12px;color:${theme.muted}\">${shop.email}</div>` : ''}
          ${shop?.address ? `<div style=\"font-size:12px;color:${theme.muted}\">${shop.address}</div>` : ''}
        </div>
      </div>
    </div>
    <div style="padding:10px 16px 20px 16px">
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead>
          <tr style="background:${theme.subtle}">
            <th style="padding:10px;border-bottom:1px solid ${theme.border};width:56px;text-align:left;color:${theme.muted};font-weight:700">#</th>
            <th style="padding:10px;border-bottom:1px solid ${theme.border};text-align:left;color:${theme.muted};font-weight:700">Item</th>
            <th style="padding:10px;border-bottom:1px solid ${theme.border};text-align:right;width:90px;color:${theme.muted};font-weight:700">Qty</th>
            <th style="padding:10px;border-bottom:1px solid ${theme.border};text-align:right;width:120px;color:${theme.muted};font-weight:700">Unit</th>
            <th style="padding:10px;border-bottom:1px solid ${theme.border};text-align:right;width:140px;color:${theme.muted};font-weight:700">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
      <div style="display:flex;justify-content:flex-end;margin-top:16px">
        <div style="min-width:320px;border:1px solid ${theme.border};border-radius:10px;overflow:hidden">
          <div style="display:flex;justify-content:space-between;padding:10px 12px;border-bottom:1px solid ${theme.border}">
            <div style="font-weight:700;color:${theme.text}">Subtotal</div>
            <div style="font-weight:700;color:${theme.text}">${formatCurrency(subtotal)}</div>
          </div>
          ${taxRate ? `<div style=\"display:flex;justify-content:space-between;padding:10px 12px;border-bottom:1px solid ${theme.border}\"><div style=\"font-weight:700;color:${theme.text}\">Tax (${(taxRate*100).toFixed(0)}%)</div><div style=\"font-weight:700;color:${theme.text}\">${formatCurrency(tax)}</div></div>` : ''}
          <div style="display:flex;justify-content:space-between;padding:12px 12px;background:${theme.primary};color:white">
            <div style="font-weight:800">Total</div>
            <div style="font-weight:800">${formatCurrency(grand)}</div>
          </div>
        </div>
      </div>
      <div style="margin-top:18px;font-size:12px;color:${theme.muted}">Thank you for your business.</div>
    </div>
  </div>`;
}

// Ensure items have proper product names (and fill price/description if missing)
async function enrichOrderForInvoice(order) {
  if (!order || !Array.isArray(order.items)) return order;
  const items = await Promise.all(
    order.items.map(async (it) => {
      if (it?.name && typeof it.name === 'string' && it.name.trim()) return it;
      if (it?.productId) {
        try {
          const p = await getProductById(it.productId);
          return {
            ...it,
            name: p?.name || it?.name || '(Unnamed Product)',
            price: typeof it?.price === 'number' ? it.price : Number(p?.price || 0),
            description: it?.description ?? (p?.description || ''),
          };
        } catch {
          return { ...it, name: it?.name || '(Unnamed Product)' };
        }
      }
      return { ...it, name: it?.name || '(Unnamed Product)' };
    })
  );
  return { ...order, items };
}

// Resolve order + parties for invoice depending on requester role (distributor vs shopkeeper)
async function loadInvoiceContext(req, orderId) {
  if (!orderId) throw new Error('orderId required');
  const requesterId = req.user.id;
  const role = (req.user.role || '').toLowerCase();
  let order = null;
  if (role === 'distributor') {
    const orders = await getOrdersByDistributor(requesterId);
    order = orders.find((o) => o.id === orderId);
    if (!order) throw new Error('Order not found for distributor');
  } else {
    // shopkeeper or salesperson: restrict to own orders
    const orders = await getOrdersByUser(requesterId);
    order = orders.find((o) => o.id === orderId);
    if (!order) throw new Error('Order not found for user');
  }
  const distributor = order?.distributorId ? await findUserById(order.distributorId) : await findUserById(req.user.id);
  const shop = order?.userId ? await findUserById(order.userId) : null;
  const enriched = await enrichOrderForInvoice(order);
  const html = buildInvoiceHtml({ order: enriched, distributor, shop });
  return { order: enriched, distributor, shop, html };
}

export async function getInvoiceHtml(req, res) {
  try {
    const { orderId } = req.params;
    if (!orderId) return res.status(400).json({ error: 'orderId required' });
    const { html } = await loadInvoiceContext(req, orderId);
    return res.json({ ok: true, html });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'failed to build invoice' });
  }
}

// Stream a simple PDF rendering of the invoice
export async function getInvoicePdf(req, res) {
  try {
    const { orderId } = req.params;
    if (!orderId) return res.status(400).json({ error: 'orderId required' });
    const { order, distributor, shop } = await loadInvoiceContext(req, orderId);

    // Lazy import to avoid requiring pdfkit in non-PDF flows
    const { default: PDFDocument } = await import('pdfkit');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${order.id}.pdf"`);

    const theme = getInvoiceTheme();
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    doc.pipe(res);

    // Header
    const org = distributor?.organizationName || distributor?.name || 'Distributor';
    const shopName = order?.shopName || shop?.organizationName || shop?.name || shop?.email || 'Shop';
    doc.fontSize(22).fillColor(theme.primary).text(org, { continued: false });
    doc.fontSize(12).fillColor(theme.text).text('TAX INVOICE', { align: 'right' });
    doc.moveDown();

    // Meta
    doc.fontSize(10).fillColor(theme.muted);
    doc.text(`Invoice #: ${order.id}`);
    doc.text(`Date: ${new Date(order.createdAt || Date.now()).toLocaleString()}`);
    doc.text(`Status: ${String(order.status || '').toUpperCase()}`);
    doc.moveDown();

    // Parties
    doc.fontSize(12).fillColor(theme.text).text('From:', { underline: true });
    doc.fontSize(10).fillColor('#374151').text(org);
    if (distributor?.email) doc.text(distributor.email);
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor(theme.text).text('Bill To:', { underline: true });
    doc.fontSize(10).fillColor('#374151').text(shopName);
    if (shop?.email) doc.text(shop.email);
    doc.moveDown();

    // Table header
    doc.fontSize(11).fillColor(theme.text);
    doc.text('#', 50, doc.y, { continued: true });
    doc.text('Product', 80, undefined, { continued: true });
    doc.text('Qty', 320, undefined, { continued: true, align: 'right' });
    doc.text('Price', 380, undefined, { continued: true, align: 'right' });
    doc.text('Total', 460, undefined, { align: 'right' });
    doc.moveTo(50, doc.y + 4).lineTo(545, doc.y + 4).strokeColor(theme.border).stroke();

    // Rows
    const lines = (order.items || []).map((it, i) => ({
      i: i + 1,
      name: it.name,
      qty: Number(it.qty || 0),
      price: Number(it.price || 0),
    }));
    let subtotal = 0;
    doc.moveDown(0.6);
    for (const l of lines) {
      const lineTotal = l.qty * l.price;
      subtotal += lineTotal;
      doc.fontSize(10).fillColor('#374151');
      doc.text(String(l.i), 50, doc.y, { continued: true });
      doc.text(l.name || '-', 80, undefined, { continued: true });
      doc.text(String(l.qty), 320, undefined, { continued: true, align: 'right' });
      doc.text(`Rs${l.price.toFixed(2)}`, 380, undefined, { continued: true, align: 'right' });
      doc.text(`Rs${lineTotal.toFixed(2)}`, 460, undefined, { align: 'right' });
    }

    // Totals
    doc.moveDown();
    doc.moveTo(300, doc.y).lineTo(545, doc.y).strokeColor(theme.border).stroke();
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor(theme.text);
    doc.text('Subtotal', 320, doc.y, { continued: true, align: 'right' });
    doc.text(`Rs${subtotal.toFixed(2)}`, 460, undefined, { align: 'right' });
    const taxRate = 0;
    const tax = subtotal * taxRate;
    if (taxRate) {
      doc.text(`Tax (${(taxRate * 100).toFixed(0)}%)`, 320, undefined, { continued: true, align: 'right' });
      doc.text(`Rs${tax.toFixed(2)}`, 460, undefined, { align: 'right' });
    }
    const grand = subtotal + tax;
    doc.font('Helvetica-Bold').fillColor(theme.text);
    doc.text('Grand Total', 320, undefined, { continued: true, align: 'right' });
    doc.text(`Rs${grand.toFixed(2)}`, 460, undefined, { align: 'right' });
    doc.rect(300, doc.y + 6, 245, 22).fillAndStroke(theme.primary, theme.primary);
    doc.fillColor('#ffffff').font('Helvetica-Bold').text('Total', 320, doc.y + 9, { continued: true, align: 'right' });
    doc.text(`Rs${grand.toFixed(2)}`, 460, doc.y + 9, { align: 'right' });
    doc.fillColor(theme.text).font('Helvetica');
    doc.moveDown();
    doc.fontSize(9).fillColor(theme.muted).text('Thank you for your business.');

    doc.end();
  } catch (err) {
    return res.status(500).json({ error: err.message || 'failed to build invoice PDF' });
  }
}

export async function sendInvoiceEmail(req, res) {
  try {
    const { orderId } = req.params;
    const { to } = req.body || {};
    if (!orderId) return res.status(400).json({ error: 'orderId required' });
    const distId = req.user.id;
    const orders = await getOrdersByDistributor(distId);
    const order = orders.find((o) => o.id === orderId);
    if (!order) return res.status(404).json({ error: 'Order not found for distributor' });
    const distributor = await findUserById(distId);
    const shop = order.userId ? await findUserById(order.userId) : null;
    const enriched = await enrichOrderForInvoice(order);
    const html = buildInvoiceHtml({ order: enriched, distributor, shop });
    const toEmail = to || shop?.email;
    if (!toEmail) return res.status(400).json({ error: 'recipient email not found' });
    const subject = `Invoice for Order #${order.id} - ${distributor?.organizationName || 'Distributor'}`;
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: toEmail,
      subject,
      html,
      text: `Please see the invoice for your order #${order.id}.`,
    });
    // Create notifications: to shop (invoice sent) and optionally to distributor (sent confirmation)
    try {
      if (shop?.id) {
        await createNotification({
          userId: shop.id,
          type: 'order',
          title: 'Invoice sent',
          message: `Invoice for order #${order.id} has been sent to your email`,
          data: { orderId: order.id, status: 'invoice_sent' },
        });
      }
      if (distributor?.id) {
        await createNotification({
          userId: distributor.id,
          type: 'order',
          title: 'Invoice emailed',
          message: `Invoice for order #${order.id} emailed to ${toEmail}`,
          data: { orderId: order.id, status: 'invoice_emailed' },
        });
      }
    } catch {}
    return res.json({ ok: true, message: 'Invoice sent', to: toEmail });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'failed to send invoice' });
  }
}

// Add to cart (simply creates a pending order)
export async function addToCart(req, res) {
  try {
    const { items } = req.body; // [{ productId, qty }]
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array required' });
    }

    
    // Build groups by distributor: { [distributorId]: { distributorName, items: [...] } }
    const groups = new Map();
    let shopName = null;
    // Fetch user/shop info
    const user = req.user;
    if (user && user.email) {
      const userObj = await findUserByEmail(user.email);
      shopName = userObj?.organizationName || userObj?.email || null;
    }

    for (const it of items) {
      const product = await getProductById(it.productId);
      if (!product) return res.status(404).json({ error: `Product not found: ${it.productId}` });
      const currentStock = Number(product.stock || 0);
      if (currentStock <= 0) {
        return res.status(400).json({ error: `Product '${product.name}' is out of stock` });
      }
      const dId = product.ownerId;
      const dName = product.distributor || product.distributorName || '';
      if (!groups.has(dId)) groups.set(dId, { distributorName: dName, items: [] });
      const group = groups.get(dId);
      group.items.push({
        productId: product.id,
        name: product.name,
        price: product.price,
        qty: Number(it.qty || 1),
        image: product.image || null,
        shopName,
      });
    }

    // For each distributor group, either append to existing pending order for this user+distributor, or create a new one
    const createdOrUpdated = [];
    // Get user's existing orders once for efficiency
    const userOrders = await getOrdersByUser(req.user.id);

    for (const [dId, payload] of groups.entries()) {
      const dName = payload.distributorName;
      const newItems = payload.items;

      // Try to find an existing pending order for this distributor
      let existing = (userOrders || []).find(o => o.status === 'pending' && (o.distributorId === dId));

      // If distributorId was not persisted (e.g., Supabase minimal schema), infer by checking first item product owner
      if (!existing) {
        for (const o of (userOrders || []).filter(o => o.status === 'pending')) {
          if (o.items && o.items.length > 0) {
            const first = o.items[0];
            try {
              const prod = await getProductById(first.productId);
              if (prod && prod.ownerId === dId) { existing = o; break; }
            } catch {}
          }
        }
      }

      if (existing) {
        // Merge items by productId (sum qty)
        const mergedMap = new Map();
        for (const it of existing.items || []) {
          mergedMap.set(it.productId, { ...it });
        }
        for (const it of newItems) {
          if (mergedMap.has(it.productId)) {
            const prev = mergedMap.get(it.productId);
            mergedMap.set(it.productId, { ...prev, qty: Number(prev.qty || 0) + Number(it.qty || 0) });
          } else {
            mergedMap.set(it.productId, { ...it });
          }
        }
        let merged = Array.from(mergedMap.values());
        // Apply simple unit pricing (no MOQ, no bulk tiers)
        const priced = [];
        for (const it of merged) {
          const product = await getProductById(it.productId);
          if (!product) return res.status(404).json({ error: `Product not found: ${it.productId}` });
          const qty = Number(it.qty || 0);
          // Simple pricing only
          let unitPrice = Number(product.price || 0);
          priced.push({ ...it, price: unitPrice });
        }
        merged = priced;
        const updated = await updateOrderItems(existing.id, merged);
        // Ensure distributor info is set when using file DB
        if (updated) {
          updated.distributorId ||= dId;
          updated.distributorName ||= dName;
        }
        createdOrUpdated.push(updated || existing);
      } else {
        // Simple unit pricing for new order items (no MOQ, no bulk tiers)
        const priced = [];
        for (const it of newItems) {
          const product = await getProductById(it.productId);
          if (!product) return res.status(404).json({ error: `Product not found: ${it.productId}` });
          const qty = Number(it.qty || 0);
          // Simple pricing only
          let unitPrice = Number(product.price || 0);
          priced.push({ ...it, price: unitPrice });
        }
        const order = await createOrder({ userId: req.user.id, items: priced, distributorId: dId, distributorName: dName, shopName });
        createdOrUpdated.push(order);
      }
    }

    // Backward compatible response: if only one order affected, include `order` too
    if (createdOrUpdated.length === 1) {
      return res.status(201).json({ ok: true, order: createdOrUpdated[0], orders: createdOrUpdated });
    }
    return res.status(201).json({ ok: true, orders: createdOrUpdated });
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
    // Notification to shop: delivered
    try {
      if (order?.userId) {
        await createNotification({
          userId: order.userId,
          type: 'order',
          title: 'Order delivered',
          message: `Your order #${order.id} was delivered`,
          data: { orderId: order.id, status: 'delivered' },
        });
      }
    } catch {}
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
    // Ensure items persist with product names; compute simple unit price (no MOQ, no tiers)
    const enrichedItems = await enrichItemsWithProductDetails(items);
    const priced = [];
    for (const it of enrichedItems) {
      const product = await getProductById(it.productId);
      if (!product) return res.status(404).json({ error: `Product not found: ${it.productId}` });
      const qty = Number(it.qty || 0);
      // Simple pricing only
      let unitPrice = Number(product.price || 0);
      priced.push({ ...it, price: unitPrice });
    }
    const order = await updateOrderItems(orderId, priced);
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
    // Notification to shop: placed
    try {
      if (order?.userId) {
        await createNotification({
          userId: order.userId,
          type: 'order',
          title: 'Order placed',
          message: `Your order #${order.id} was placed by the distributor`,
          data: { orderId: order.id, status: 'placed' },
        });
      }
    } catch {}
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
    // Notification to shop: out for delivery
    try {
      if (order?.userId) {
        await createNotification({
          userId: order.userId,
          type: 'order',
          title: 'Out for delivery',
          message: `Your order #${order.id} is out for delivery`,
          data: { orderId: order.id, status: 'out_for_delivery' },
        });
      }
    } catch {}
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

    // Prevent confirmation if any product in the order has zero stock
    for (const item of order.items || []) {
      const product = await getProductById(item.productId);
      if (!product) return res.status(404).json({ error: `Product not found: ${item.productId}` });
      const currentStock = Number(product.stock || 0);
      if (currentStock <= 0) {
        return res.status(400).json({ error: `Product '${product.name}' is out of stock` });
      }
    }

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

    // Notification to distributor: new order
    try {
      if (distributorId) {
        await createNotification({
          userId: distributorId,
          type: 'order',
          title: 'New order received',
          message: `New order #${confirmedOrder.id} from ${confirmedOrder.shopName || 'shop'}`,
          data: { orderId: confirmedOrder.id, status: 'new_order' },
        });
      }
    } catch {}

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
    // Notification to shop: accepted
    try {
      if (acceptedOrder?.userId) {
        await createNotification({
          userId: acceptedOrder.userId,
          type: 'order',
          title: 'Order accepted',
          message: `Your order #${acceptedOrder.id} was accepted by the distributor`,
          data: { orderId: acceptedOrder.id, status: 'accepted' },
        });
      }
    } catch {}

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

    // Strong filter: ensure orders actually belong to this distributor
    const filteredByDistributor = [];
    for (const o of orders) {
      if (o.distributorId && o.distributorId === distributorId) {
        filteredByDistributor.push(o);
        continue;
      }
      // Fallback inference by checking first item's product owner
      if (o.items && o.items.length > 0) {
        try {
          const prod = await getProductById(o.items[0].productId);
          if (prod && prod.ownerId === distributorId) filteredByDistributor.push(o);
        } catch {}
      }
    }
    orders = filteredByDistributor;

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
