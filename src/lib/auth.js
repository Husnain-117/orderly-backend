import jwt from 'jsonwebtoken';

export function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.sid;
    if (!token) return res.status(401).json({ error: 'unauthorized' });
    const secret = process.env.JWT_SECRET || (process.env.NODE_ENV !== 'production' ? 'dev-secret-change-me' : undefined);
    if (!secret) {
      return res.status(500).json({ error: 'server_misconfigured' });
    }
    const payload = jwt.verify(token, secret);
    req.user = { id: payload.id, email: payload.email, role: payload.role };
    return next();
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }
}

export function requireDistributor(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  if (req.user.role !== 'distributor') return res.status(403).json({ error: 'forbidden' });
  return next();
}
