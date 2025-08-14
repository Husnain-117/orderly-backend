import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from '../src/routes/authRoutes.js';
import productRoutes from '../src/routes/productRoutes.js';
import uploadRoutes from '../src/routes/uploadRoutes.js';
import orderRoutes from '../src/routes/orderRoutes.js';

// Build an Express app compatible with Vercel Serverless Functions
const app = express();

// CORS (same logic as src/index.js, but without server listen)
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim());
const allowAllInDev = process.env.NODE_ENV !== 'production';

const corsOptions = {
  origin(origin, callback) {
    if (allowAllInDev) return callback(null, true);
    if (!origin) return callback(null, true);
    if (corsOrigins.includes(origin)) return callback(null, true);
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

// Export a request handler function for Vercel
export default function handler(req, res) {
  return app(req, res);
}
