import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { requireAuth, requireDistributor } from '../lib/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';

const BUCKET = process.env.SUPABASE_BUCKET || 'uploads';

// Use memory storage; we'll upload the buffer to Supabase Storage
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

const router = Router();

// Auth required, distributor only
router.use(requireAuth, requireDistributor);

router.post('/image', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file is required' });

    const ext = path.extname(req.file.originalname) || '.bin';
    const base = path
      .basename(req.file.originalname, ext)
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      .slice(0, 64);
    const filename = `${Date.now()}_${base}${ext}`;
    const objectPath = `images/${req.user?.id || 'anonymous'}/${filename}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(objectPath, req.file.buffer, {
        contentType: req.file.mimetype || 'application/octet-stream',
        upsert: false,
      });

    if (uploadError) {
      return res.status(500).json({ error: `upload_failed: ${uploadError.message}` });
    }

    const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(objectPath);
    const publicUrl = data?.publicUrl;
    if (!publicUrl) return res.status(500).json({ error: 'failed_to_get_public_url' });

    return res.json({ ok: true, url: publicUrl, bucket: BUCKET, path: objectPath });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'upload_failed' });
  }
});

export default router;
