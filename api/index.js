import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from '../src/routes/authRoutes.js';
import productRoutes from '../src/routes/productRoutes.js';
import uploadRoutes from '../src/routes/uploadRoutes.js';
import orderRoutes from '../src/routes/orderRoutes.js';
import notificationRoutes from '../src/routes/notificationRoutes.js';
import analyticsRoutes from '../src/routes/analyticsRoutes.js';
import linkRoutes from '../src/routes/linkRoutes.js';

// Build an Express app compatible with Vercel Serverless Functions
const app = express();

// CORS (mirror src/index.js with sane defaults)
const normalizeOrigin = (o) => (o || '').replace(/\/$/, '');
const defaultOrigins = [
  'http://localhost:5173',
  'http://localhost:8080',
  'http://192.168.0.100:8080',
  'https://orderly-f.vercel.app',
  'https://orderly-eight.vercel.app',
];
const envOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => normalizeOrigin(s.trim()))
  .filter(Boolean);
const rawOrigins = [...new Set([...defaultOrigins.map(normalizeOrigin), ...envOrigins])];
const allowAllInDev = process.env.NODE_ENV !== 'production';

function isAllowedOrigin(origin) {
  if (!origin) return true;
  const o = normalizeOrigin(origin);
  
  // Allow all Vercel preview deployments (*.vercel.app)
  if (o.endsWith('.vercel.app')) return true;
  
  for (const pat of rawOrigins) {
    if (pat === o) return true;
    if (pat.startsWith('*.') && o.endsWith(pat.slice(1))) return true;
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

// Routes
app.get('/', (_req, res) => {
  res.json({ ok: true, message: 'Orderly serverless API running', env: process.env.NODE_ENV || 'development' });
});
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/auth', authRoutes);
app.use('/products', productRoutes);
app.use('/upload', uploadRoutes);
app.use('/orders', orderRoutes);
app.use('/notifications', notificationRoutes);
app.use('/analytics', analyticsRoutes);
app.use('/links', linkRoutes);

// Quick env diagnostics (does not expose secrets)
app.get('/env-check', (_req, res) => {
  res.json({
    ok: true,
    env: process.env.NODE_ENV || 'development',
    has: {
      JWT_SECRET: Boolean(process.env.JWT_SECRET),
      FRONTEND_URL: Boolean(process.env.FRONTEND_URL),
      CORS_ORIGIN: Boolean(process.env.CORS_ORIGIN),
      SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      SMTP_FROM: Boolean(process.env.SMTP_FROM),
    },
  });
});

// Global error handler to avoid unhandled crashes
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const message = err?.message || 'internal_error';
  res.status(500).json({ ok: false, error: message });
});

// Export a request handler function for Vercel
export default function handler(req, res) {
  return app(req, res);
}
