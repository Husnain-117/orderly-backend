import bcrypt from 'bcryptjs';

// Simple in-memory OTP store: { [email]: { hash: string, expiresAt: number } }
// Note: This resets on server restart. For production, replace with a DB or cache (e.g., Redis).
const store = new Map();

const EXP_MINUTES = Number(process.env.OTP_EXPIRES_MINUTES || 10);

export function generateOtp() {
  // 6-digit numeric OTP
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function storeOtp(email, otp) {
  email = String(email).trim().toLowerCase();
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(otp, salt);
  const expiresAt = Date.now() + EXP_MINUTES * 60 * 1000;

  store.set(email, { hash, expiresAt });
}

export async function verifyAndConsumeOtp(email, otp) {
  email = String(email).trim().toLowerCase();
  const record = store.get(email);
  if (!record) throw new Error('OTP not found');

  const expired = record.expiresAt < Date.now();
  if (expired) {
    store.delete(email);
    throw new Error('OTP expired');
  }

  const ok = await bcrypt.compare(otp, record.hash);
  if (!ok) throw new Error('Invalid OTP');

  // consume
  store.delete(email);
  return true;
}
