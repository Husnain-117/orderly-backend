import { generateOtp, storeOtp, verifyAndConsumeOtp } from '../models/otpModel.js';
import { sendOtpEmail } from '../lib/mailer.js';
import jwt from 'jsonwebtoken';
import { createUser, verifyPassword, findUserByEmail, updateUserPassword, findUserById, updateUserProfile } from '../models/userModel.js';

export async function sendOtp(req, res) {
  try {
    let { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email is required' });
    email = String(email).trim().toLowerCase();

    const otp = generateOtp();
    await storeOtp(email, otp);

    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.log(`[DEV] OTP for ${email}: ${otp}`);
    }

    await sendOtpEmail(email, otp);

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'failed to send otp' });
  }
}

export async function verifyOtp(req, res) {
  try {
    let { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: 'email and otp are required' });
    email = String(email).trim().toLowerCase();

    await verifyAndConsumeOtp(email, otp);

    // OTP verified successfully; downstream app can now proceed (e.g., create user in your DB)
    return res.json({ ok: true, email });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'verification failed' });
  }
}

// List all distributors
import { initDb } from '../models/userModel.js';
export async function listDistributors(_req, res) {
  try {
    const db = await initDb();
    const users = db.data?.users?.filter((u) => u.role === 'distributor') || [];
    // Don't send passwordHash
    const safeUsers = users.map(({ passwordHash, ...rest }) => rest);
    return res.json({ ok: true, distributors: safeUsers });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'failed to list distributors' });
  }
}

// Issue a signed JWT and set it as an httpOnly cookie
function setSessionCookie(res, payload) {
  const secret = process.env.JWT_SECRET || (process.env.NODE_ENV !== 'production' ? 'dev-secret-change-me' : undefined);
  if (!secret) {
    throw new Error('server_misconfigured: JWT_SECRET is required in production');
  }
  const token = jwt.sign(payload, secret, { expiresIn: '1h' });
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('sid', token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export async function register(req, res) {
  try {
    const { email, password, role, organizationName } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
    if (!role || !['distributor', 'shopkeeper'].includes(String(role))) {
      return res.status(400).json({ error: 'valid role is required (distributor|shopkeeper)' });
    }
    if (!organizationName || String(organizationName).trim().length < 2) {
      return res.status(400).json({ error: 'organizationName is required' });
    }

    // Return 409 if user already exists
    const existing = await findUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'user already exists' });
    }

    const user = await createUser({ email, password, role, organizationName });
    setSessionCookie(res, { id: user.id, email: user.email, role: user.role });
    return res.json({ ok: true, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'registration failed' });
  }
}

export async function login(req, res) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
    const user = await verifyPassword(email, password);
    if (!user) return res.status(401).json({ error: 'invalid credentials' });
    setSessionCookie(res, { id: user.id, email: user.email, role: user.role });
    return res.json({ ok: true, user });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'login failed' });
  }
}

export async function me(req, res) {
  try {
    const token = req.cookies?.sid;
    if (!token) return res.status(401).json({ error: 'unauthorized' });
    const secret = process.env.JWT_SECRET || (process.env.NODE_ENV !== 'production' ? 'dev-secret-change-me' : undefined);
    if (!secret) return res.status(500).json({ error: 'server_misconfigured' });
    const payload = jwt.verify(token, secret);
    const user = await findUserByEmail(payload.email);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    return res.json({ ok: true, user: { id: user.id, email: user.email, role: user.role } });
  } catch (_e) {
    return res.status(401).json({ error: 'unauthorized' });
  }
}

export async function logout(_req, res) {
  res.clearCookie('sid', { path: '/' });
  return res.json({ ok: true });
}

// Forgot password: 1) send OTP to email
export async function forgotPasswordSendOtp(req, res) {
  try {
    let { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email is required' });
    email = String(email).trim().toLowerCase();
    const user = await findUserByEmail(email);
    // Do not leak user existence; respond ok even if not found
    const otp = generateOtp();
    await storeOtp(email, otp);
    if (user) {
      try {
        await sendOtpEmail(email, otp);
      } catch (e) {
        // if email sending fails, still return 200 to avoid enumeration; optionally log in dev
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.warn('sendOtpEmail failed during forgot-password:', e?.message);
        }
      }
    }
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.log(`[DEV] Forgot-Password OTP for ${email}: ${otp}`);
    }
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'failed to send reset code' });
  }
}

// Forgot password: 2) verify OTP and set new password
export async function resetPassword(req, res) {
  try {
    let { email, otp, newPassword } = req.body || {};
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: 'email, otp, and newPassword are required' });
    }
    email = String(email).trim().toLowerCase();
    if (String(newPassword).length < 6) {
      return res.status(400).json({ error: 'password must be at least 6 characters' });
    }
    await verifyAndConsumeOtp(email, otp);
    const updated = await updateUserPassword(email, newPassword);
    // Optional: sign the user in right away
    setSessionCookie(res, { id: updated.id, email: updated.email, role: updated.role });
    return res.json({ ok: true, user: { id: updated.id, email: updated.email, role: updated.role } });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'reset failed' });
  }
}

// Get user profile
export async function getProfile(req, res) {
  try {
    // Authenticate via sid cookie (same as me())
    const token = req.cookies?.sid;
    if (!token) return res.status(401).json({ error: 'unauthorized' });
    const secret = process.env.JWT_SECRET || 'dev-secret-change-me';
    const payload = jwt.verify(token, secret);

    // Load user by id (fallback to email if needed)
    let user = null;
    if (payload?.id) {
      user = await findUserById(payload.id);
    }
    if (!user && payload?.email) {
      user = await findUserByEmail(payload.email);
    }
    if (!user) return res.status(401).json({ error: 'unauthorized' });

    const { passwordHash, ...profile } = user;
    return res.json({ ok: true, profile });
  } catch (err) {
    return res.status(401).json({ error: 'unauthorized' });
  }
}

// Update user profile
export async function updateProfile(req, res) {
  try {
    // Authenticate via sid cookie (same as me())
    const token = req.cookies?.sid;
    if (!token) return res.status(401).json({ error: 'unauthorized' });
    const secret = process.env.JWT_SECRET || 'dev-secret-change-me';
    const payload = jwt.verify(token, secret);

    if (!payload?.id) return res.status(401).json({ error: 'unauthorized' });

    const { name, organizationName, phone, address, photo } = req.body || {};

    const updatedUser = await updateUserProfile(payload.id, {
      name,
      organizationName,
      phone,
      address,
      photo,
    });

    return res.json({ ok: true, profile: updatedUser });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'failed to update profile' });
  }
}
