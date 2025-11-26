import { generateOtp, storeOtp, verifyAndConsumeOtp } from '../models/otpModel.js';
import { sendOtpEmail } from '../lib/mailer.js';
import jwt from 'jsonwebtoken';
import {
  createUser,
  verifyPassword,
  findUserByEmail,
  findUserById,
  updateUserPassword,
  updateUserProfile,
  createSalespersonLinkRequest,
  getSalespersonLinkStatus,
  listSalespersonLinkRequestsForDistributor,
  approveSalespersonLinkRequest,
  rejectSalespersonLinkRequest,
  listLinkedSalespersonsForDistributor,
  unlinkSalespersonFromDistributor,
} from '../models/userModel.js';
import { transporter } from '../lib/mailer.js';

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

// Public: Get a single distributor public profile by ID
export async function getDistributorPublicProfile(req, res) {
  try {
    const { id } = req.params || {};
    if (!id) return res.status(400).json({ error: 'id is required' });
    if (isSupabaseConfigured()) {
      const sb = getSupabaseAdmin();
      const { data, error } = await sb
        .from('users')
        .select('id, email, role, organization_name, created_at, name, address, phone, photo')
        .eq('id', id)
        .eq('role', 'distributor')
        .single();
      if (error || !data) return res.status(404).json({ error: 'not_found' });
      const out = {
        id: data.id,
        email: data.email,
        role: data.role,
        organizationName: data.organization_name || null,
        createdAt: data.created_at,
        name: data.name || null,
        address: data.address || null,
        phone: data.phone || null,
        photo: data.photo || null,
      };
      return res.json({ ok: true, distributor: out });
    }
    
    // LowDB fallback
    const db = await initDb();
    const u = (db.data?.users || []).find((x) => x.id === id && x.role === 'distributor');
    if (!u) return res.status(404).json({ error: 'not_found' });
    const { passwordHash, ...safe } = u;
    return res.json({ ok: true, distributor: safe });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'failed to fetch distributor' });
  }
}

// Distributor: list linked salespersons (approved)
export async function distributorListSalespersons(req, res) {
  try {
    const token = req.cookies?.sid;
    if (!token) return res.status(401).json({ error: 'unauthorized' });
    const secret = process.env.JWT_SECRET || (process.env.NODE_ENV !== 'production' ? 'dev-secret-change-me' : undefined);
    if (!secret) return res.status(500).json({ error: 'server_misconfigured' });
    const payload = jwt.verify(token, secret);
    const me = await findUserById(payload.id);
    if (!me || me.role !== 'distributor') return res.status(403).json({ error: 'forbidden' });
    const items = await listLinkedSalespersonsForDistributor(me.id);
    // Enrich with user info
    const uniqueIds = Array.from(new Set(items.map(i => i.salespersonId)));
    const users = await Promise.all(uniqueIds.map(id => findUserById(id)));
    const userMap = new Map(users.filter(Boolean).map(u => [u.id, u]));
    const out = items.map(i => ({
      ...i,
      salesperson: userMap.get(i.salespersonId) ? {
        id: userMap.get(i.salespersonId).id,
        email: userMap.get(i.salespersonId).email,
        name: userMap.get(i.salespersonId).name || null,
      } : null,
    }));
    return res.json({ ok: true, salespersons: out });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'failed to list salespersons' });
  }
}

// Distributor: unlink a salesperson (remove membership)
export async function distributorUnlinkSalesperson(req, res) {
  try {
    const token = req.cookies?.sid;
    if (!token) return res.status(401).json({ error: 'unauthorized' });
    const secret = process.env.JWT_SECRET || (process.env.NODE_ENV !== 'production' ? 'dev-secret-change-me' : undefined);
    if (!secret) return res.status(500).json({ error: 'server_misconfigured' });
    const payload = jwt.verify(token, secret);
    const me = await findUserById(payload.id);
    if (!me || me.role !== 'distributor') return res.status(403).json({ error: 'forbidden' });
    const { salespersonId } = req.params;
    const rec = await unlinkSalespersonFromDistributor(salespersonId, me.id);
    // Notify salesperson via email (best-effort)
    try {
      const sp = await findUserById(salespersonId);
      if (sp?.email) {
        await transporter.sendMail({
          from: process.env.SMTP_FROM,
          to: sp.email,
          subject: 'Distributor Unlinked You',
          text: `You have been unlinked from distributor ${me.organizationName || me.email}. You can request to link to another distributor from your Sales dashboard.`,
        });
      }
    } catch {}
    return res.json({ ok: true, unlink: rec });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'failed to unlink salesperson' });
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
import { getSupabaseAdmin, isSupabaseConfigured } from '../lib/supabase.js';
export async function listDistributors(_req, res) {
  try {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseAdmin();
      const { data, error } = await sb
        .from('users')
        .select('id, email, role, organization_name, created_at')
        .eq('role', 'distributor');
      if (error) throw new Error(error.message);
      const mapped = (data || []).map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        organizationName: u.organization_name || null,
        createdAt: u.created_at,
      }));
      return res.json({ ok: true, distributors: mapped });
    }
    // Fallback to LowDB
    const db = await initDb();
    const users = db.data?.users?.filter((u) => u.role === 'distributor') || [];
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
    if (!role || !['distributor', 'shopkeeper', 'salesperson'].includes(String(role))) {
      return res.status(400).json({ error: 'valid role is required (distributor|shopkeeper|salesperson)' });
    }
    // organizationName required for distributor, optional for others
    if (String(role) === 'distributor') {
      if (!organizationName || String(organizationName).trim().length < 2) {
        return res.status(400).json({ error: 'organizationName is required' });
      }
    }

    // Return 409 if user already exists
    const existing = await findUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'user_already_exists' });
    }

    const user = await createUser({ email, password, role, organizationName });
    setSessionCookie(res, { id: user.id, email: user.email, role: user.role });
    return res.json({ ok: true, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    // Normalize duplicate errors (e.g., race condition) to 409
    if (String(err?.message || '').toLowerCase().includes('already exists')) {
      return res.status(409).json({ error: 'user_already_exists' });
    }
    return res.status(400).json({ error: err.message || 'registration failed' });
  }
}

export async function login(req, res) {
  try {
    const { email, password, role } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
    if (!role || !['distributor', 'shopkeeper', 'salesperson'].includes(String(role))) {
      return res.status(400).json({ error: 'valid role is required (distributor|shopkeeper|salesperson)' });
    }
    // First check if the user exists to differentiate errors
    const existing = await findUserByEmail(email);
    if (!existing) {
      return res.status(404).json({ error: 'user_not_found' });
    }
    // Role must match the stored role; otherwise respond with invalid credentials
    const expectedRole = String(role).toLowerCase();
    const storedRole = String(existing.role || '').toLowerCase();
    if (expectedRole !== storedRole) {
      return res.status(401).json({ error: 'invalid_credentials' });
    }
    // Then verify password to detect wrong password case
    const user = await verifyPassword(email, password);
    if (!user) {
      return res.status(401).json({ error: 'wrong_password' });
    }
    setSessionCookie(res, { id: user.id, email: user.email, role: user.role });
    // Salesperson first-login hint: include status so frontend can redirect to linking flow
    let meta = {};
    if (user.role === 'salesperson') {
      try {
        const status = await getSalespersonLinkStatus(user.id);
        meta = { salespersonLinkStatus: status };
      } catch {}
    }
    return res.json({ ok: true, user, ...meta });
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

// Salesperson: request link to distributor by distributor email
export async function salespersonRequestLink(req, res) {
  try {
    const token = req.cookies?.sid;
    if (!token) return res.status(401).json({ error: 'unauthorized' });
    const secret = process.env.JWT_SECRET || (process.env.NODE_ENV !== 'production' ? 'dev-secret-change-me' : undefined);
    if (!secret) return res.status(500).json({ error: 'server_misconfigured' });
    const payload = jwt.verify(token, secret);
    const me = await findUserById(payload.id);
    if (!me || me.role !== 'salesperson') return res.status(403).json({ error: 'forbidden' });
    let { distributorEmail } = req.body || {};
    if (!distributorEmail) return res.status(400).json({ error: 'distributorEmail is required' });
    distributorEmail = String(distributorEmail).trim().toLowerCase();
    const distributor = await findUserByEmail(distributorEmail);
    if (!distributor || distributor.role !== 'distributor') {
      return res.status(404).json({ error: 'distributor_not_found' });
    }
    const reqObj = await createSalespersonLinkRequest({ salespersonId: me.id, distributorId: distributor.id });
    // Fire-and-forget email to distributor
    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: distributor.email,
        subject: 'New Salesperson Link Request',
        text: `Salesperson ${me.email} requested to link to your distributor account. Request ID: ${reqObj.id}`,
      });
    } catch {}
    return res.json({ ok: true, request: reqObj });
  } catch (err) {
    const msg = String(err?.message || '')
    if (msg === 'already_linked_active') {
      return res.status(409).json({ error: 'already_linked_active' })
    }
    if (msg === 'already_requested') {
      return res.status(409).json({ error: 'already_requested' })
    }
    return res.status(400).json({ error: err.message || 'failed to create request' });
  }
}

// Salesperson: check link status
export async function salespersonLinkStatus(req, res) {
  try {
    const token = req.cookies?.sid;
    if (!token) return res.status(401).json({ error: 'unauthorized' });
    const secret = process.env.JWT_SECRET || (process.env.NODE_ENV !== 'production' ? 'dev-secret-change-me' : undefined);
    if (!secret) return res.status(500).json({ error: 'server_misconfigured' });
    const payload = jwt.verify(token, secret);
    const me = await findUserById(payload.id);
    if (!me || me.role !== 'salesperson') return res.status(403).json({ error: 'forbidden' });
    const status = await getSalespersonLinkStatus(me.id);
    return res.json({ ok: true, status });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'failed to get status' });
  }
}

// Distributor: list salesperson link requests
export async function distributorListSalespersonRequests(req, res) {
  try {
    const token = req.cookies?.sid;
    if (!token) return res.status(401).json({ error: 'unauthorized' });
    const secret = process.env.JWT_SECRET || (process.env.NODE_ENV !== 'production' ? 'dev-secret-change-me' : undefined);
    if (!secret) return res.status(500).json({ error: 'server_misconfigured' });
    const payload = jwt.verify(token, secret);
    const me = await findUserById(payload.id);
    if (!me || me.role !== 'distributor') return res.status(403).json({ error: 'forbidden' });
    const items = await listSalespersonLinkRequestsForDistributor(me.id);
    const pending = items.filter((r) => r.status === 'pending');
    return res.json({ ok: true, requests: pending });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'failed to list requests' });
  }
}

// Distributor: approve request
export async function distributorApproveSalespersonRequest(req, res) {
  try {
    const token = req.cookies?.sid;
    if (!token) return res.status(401).json({ error: 'unauthorized' });
    const secret = process.env.JWT_SECRET || (process.env.NODE_ENV !== 'production' ? 'dev-secret-change-me' : undefined);
    if (!secret) return res.status(500).json({ error: 'server_misconfigured' });
    const payload = jwt.verify(token, secret);
    const me = await findUserById(payload.id);
    if (!me || me.role !== 'distributor') return res.status(403).json({ error: 'forbidden' });
    const { id } = req.params;
    const updated = await approveSalespersonLinkRequest(id, me.id);
    // Notify salesperson via email (best-effort)
    try {
      const sp = await findUserById(updated.salespersonId);
      if (sp?.email) {
        await transporter.sendMail({
          from: process.env.SMTP_FROM,
          to: sp.email,
          subject: 'Your Sales Link Was Approved',
          text: `Your request to link with distributor ${me.organizationName || me.email} was approved. You now have access to the Sales dashboard.`,
        });
      }
    } catch {}
    return res.json({ ok: true, request: updated });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'failed to approve request' });
  }
}

// Distributor: reject request
export async function distributorRejectSalespersonRequest(req, res) {
  try {
    const token = req.cookies?.sid;
    if (!token) return res.status(401).json({ error: 'unauthorized' });
    const secret = process.env.JWT_SECRET || (process.env.NODE_ENV !== 'production' ? 'dev-secret-change-me' : undefined);
    if (!secret) return res.status(500).json({ error: 'server_misconfigured' });
    const payload = jwt.verify(token, secret);
    const me = await findUserById(payload.id);
    if (!me || me.role !== 'distributor') return res.status(403).json({ error: 'forbidden' });
    const { id } = req.params;
    const updated = await rejectSalespersonLinkRequest(id, me.id);
    return res.json({ ok: true, request: updated });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'failed to reject request' });
  }
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
