import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/authRoutes.js';
import productRoutes from './routes/productRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const PORT = process.env.PORT || 4000;

// CORS (support multiple origins, credentials, and explicit headers/methods)
const normalizeOrigin = (o) => (o || '').replace(/\/$/, '');
// Defaults cover common local dev hosts and provided Vercel frontend
const defaultOrigins = [
  'http://localhost:5173',
  'http://localhost:8080',
  'http://192.168.0.100:8080',
  'https://orderly-f.vercel.app',
];
// Merge env-provided origins
const envOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => normalizeOrigin(s.trim()))
  .filter(Boolean);
const rawOrigins = [...new Set([...defaultOrigins.map(normalizeOrigin), ...envOrigins])];
const allowAllInDev = process.env.NODE_ENV !== 'production';

function isAllowedOrigin(origin) {
  if (!origin) return true; // allow same-origin/no-origin requests
  const o = normalizeOrigin(origin);
  for (const pat of rawOrigins) {
    if (pat === o) return true; // exact match
    if (pat.startsWith('*.') && o.endsWith(pat.slice(1))) return true; // wildcard suffix match
  }
  return false;
}

const corsOptions = {
  origin(origin, callback) {
    if (allowAllInDev) return callback(null, true);
    if (isAllowedOrigin(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json());
app.use(cookieParser());

// Static files for uploaded images
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
app.use('/uploads', express.static(path.join(rootDir, 'uploads')));

// Friendly root message
app.get('/', (_req, res) => res.json({ ok: true, message: 'Orderly server running', env: process.env.NODE_ENV || 'development' }));

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/auth', authRoutes);
app.use('/products', productRoutes);
app.use('/upload', uploadRoutes);
app.use('/orders', orderRoutes);
app.use('/notifications', notificationRoutes);
app.use('/analytics', analyticsRoutes);

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Auth server listening on port ${PORT}`);
});
