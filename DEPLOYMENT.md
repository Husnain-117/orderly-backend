# Orderly Backend - Vercel Deployment Guide

## 🚀 Quick Fix for Current Error

Your error is caused by missing environment variables in Vercel. Follow these steps:

### Step 1: Add Environment Variables to Vercel

Go to your Vercel Dashboard → `orderly-backend` project → Settings → Environment Variables

Add the following variables:

```env
# Required - Frontend URL for email links
FRONTEND_URL=https://orderly-f.vercel.app

# Required - JWT Secret for session cookies
JWT_SECRET=your-random-secret-key-here

# Required - SMTP Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-char-app-password
SMTP_FROM="Orderly <your-email@gmail.com>"

# Optional - CORS (now supports all *.vercel.app domains automatically)
CORS_ORIGIN=https://orderly-f.vercel.app

# Optional - OTP expiry
OTP_EXPIRES_MINUTES=10
```

### Step 2: Get Gmail App Password

1. Go to https://myaccount.google.com/security
2. Enable **2-Step Verification** (if not enabled)
3. Go to **App passwords** (under "How you sign in to Google")
4. Generate a new app password for "Mail" → "Other (Orderly Backend)"
5. Copy the 16-character password (without spaces)
6. Use this as `SMTP_PASS`

### Step 3: Generate JWT Secret

Run this command in your terminal:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output and use it as `JWT_SECRET`

### Step 4: Redeploy

After adding all environment variables:

1. Go to **Deployments** tab in Vercel
2. Click the **three dots (...)** on the latest deployment
3. Click **"Redeploy"**
4. Wait for deployment to complete

### Step 5: Clear Browser Cookies

1. Open DevTools (F12)
2. Go to **Application** tab → **Cookies**
3. Delete the `sid` cookie
4. Refresh and login again

---

## 🔧 What Was Fixed

### 1. CORS Configuration
- **Added wildcard support** for all `*.vercel.app` domains
- This allows any Vercel preview deployment to work automatically
- No need to manually add each deployment URL

### 2. Environment Variables
- Added `FRONTEND_URL` to `.env.example`
- This is required for email links to work properly

---

## 📋 Complete Environment Variables Checklist

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `FRONTEND_URL` | ✅ Yes | Frontend URL for email links | `https://orderly-f.vercel.app` |
| `JWT_SECRET` | ✅ Yes | Secret for signing JWT tokens | `abc123...` (32+ chars) |
| `SMTP_HOST` | ✅ Yes | SMTP server hostname | `smtp.gmail.com` |
| `SMTP_PORT` | ✅ Yes | SMTP server port | `587` |
| `SMTP_USER` | ✅ Yes | SMTP username (email) | `your@gmail.com` |
| `SMTP_PASS` | ✅ Yes | SMTP password (app password) | `abcdefghijklmnop` |
| `SMTP_FROM` | ✅ Yes | Email sender address | `"Orderly <your@gmail.com>"` |
| `CORS_ORIGIN` | ⚠️ Optional | Additional CORS origins | `https://custom-domain.com` |
| `OTP_EXPIRES_MINUTES` | ⚠️ Optional | OTP expiry time | `10` |
| `NODE_ENV` | ⚠️ Auto-set | Environment mode | `production` (set by Vercel) |

---

## 🐛 Troubleshooting

### Error: "unauthorized"
- **Cause:** Invalid or missing JWT token
- **Fix:** Clear browser cookies and login again

### Error: "FRONTEND_URL is not set"
- **Cause:** Missing environment variable in Vercel
- **Fix:** Add `FRONTEND_URL` to Vercel environment variables and redeploy

### Error: "CORS policy"
- **Cause:** Frontend URL not allowed
- **Fix:** Now fixed! All `*.vercel.app` domains are automatically allowed

### Error: "SMTP env vars missing"
- **Cause:** Missing SMTP configuration
- **Fix:** Add all SMTP variables to Vercel and redeploy

---

## 📝 Notes

- **Always redeploy** after adding/changing environment variables
- **Clear cookies** after redeploying with new JWT_SECRET
- **Use App Passwords** for Gmail (not your regular password)
- **Wildcard CORS** is now enabled for all Vercel deployments

---

## 🔗 Useful Links

- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)
- [Google App Passwords](https://support.google.com/accounts/answer/185833)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
