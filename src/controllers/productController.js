import { createProduct, listProducts, getProductById, updateProduct, deleteProduct } from '../models/productModel.js';

// Create product (distributor only)
export async function create(req, res) {
  try {
    const { name, price, stock, image, description } = req.body || {};
    if (!name || price === undefined) {
      return res.status(400).json({ error: 'name and price are required' });
    }
    const product = await createProduct({
      ownerId: req.user.id,
      name,
      price,
      stock: stock ?? 0,
      image: image || null,
      description: description || '',
    });
    return res.status(201).json({ ok: true, product });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'failed to create product' });
  }
}

// List all products with distributor name (public)
import { initDb as initUserDb } from '../models/userModel.js';
import path from 'path';

export async function listAllPublic(_req, res) {
  try {
    // Get products
    const products = await listProducts();
    // Get users
    const userDb = await initUserDb();
    const users = userDb.data?.users || [];
    // Attach distributor name and ensure image URLs are complete
    const result = products.map((p) => {
      const owner = users.find((u) => u.id === p.ownerId);
      let imageUrl = p.image;
      
      // If image exists but is a relative path, make it an absolute URL
      if (imageUrl && !imageUrl.startsWith('http') && !imageUrl.startsWith('/')) {
        // Assuming images are served from the /uploads directory
        imageUrl = `/uploads/${imageUrl}`;
      }
      
      return {
        ...p,
        image: imageUrl, // Update the image URL
        distributorName: owner?.organizationName || owner?.email || 'Unknown',
      };
    });
    return res.json({ ok: true, products: result });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'failed to fetch products' });
  }
}

// List products (own products for distributor)
export async function listMine(req, res) {
  try {
    const items = await listProducts({ ownerOnly: true, ownerId: req.user.id });
    return res.json({ ok: true, products: items });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'failed to fetch products' });
  }
}

// Get single product (must be owner)
export async function getOne(req, res) {
  try {
    const p = await getProductById(req.params.id);
    if (!p || p.ownerId !== req.user.id) return res.status(404).json({ error: 'not found' });
    return res.json({ ok: true, product: p });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'failed to fetch product' });
  }
}

// Update product (owner only)
export async function update(req, res) {
  try {
    const p = await getProductById(req.params.id);
    if (!p || p.ownerId !== req.user.id) return res.status(404).json({ error: 'not found' });
    const updated = await updateProduct(req.params.id, req.body || {});
    return res.json({ ok: true, product: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'failed to update product' });
  }
}

// Delete product (owner only)
export async function remove(req, res) {
  try {
    const p = await getProductById(req.params.id);
    if (!p || p.ownerId !== req.user.id) return res.status(404).json({ error: 'not found' });
    const ok = await deleteProduct(req.params.id);
    if (!ok) return res.status(404).json({ error: 'not found' });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'failed to delete product' });
  }
}

// Bulk create products (distributor only)
export async function bulkCreate(req, res) {
  try {
    const items = Array.isArray(req.body?.products) ? req.body.products : [];
    if (!items.length) return res.status(400).json({ error: 'products array is required' });
    const ownerId = req.user.id;
    const results = [];
    for (const it of items) {
      if (!it?.name || it?.price === undefined) continue;
      const product = await createProduct({
        ownerId,
        name: String(it.name).trim(),
        price: Number(it.price),
        stock: Number(it.stock ?? 0),
        image: it.image ? String(it.image).trim() : null,
        description: it.description ? String(it.description).trim() : '',
      });
      results.push(product);
    }
    return res.status(201).json({ ok: true, created: results.length, products: results });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'bulk create failed' });
  }
}
