# Kopi Nako - Cafe Ordering & Reservation Platform

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-botrs2br)

A modern, high-performance web application for cafe order management, walk-in table QR claiming, reservations, and group ordering.

---

## Environment Variables Reference

| Variable | Required in Prod | Allowed Values / Format | Description |
| :--- | :---: | :--- | :--- |
| `TRUSTED_IP_HEADER` | **Yes** | `vercel` \| `netlify` | Configures the authoritative client IP reverse proxy header. On Vercel, uses `x-vercel-forwarded-for`. On Netlify, uses `x-nf-client-connection-ip`. **Fails loudly** on startup in production if unset or set to `none`, preventing IP spoofing and shared-bucket fallback. |
| `IP_HASH_SECRET` | **Yes** | 32+ char random string | Secret salt used for HMAC-SHA256 client IP hashing. Ensures privacy and prevents rainbow table / correlation attacks on IP hashes. Required in production; dev fallbacks are strictly disabled in production. |
| `NEXT_PUBLIC_SITE_URL` | **Yes** | `https://your-domain.com` | Canonical public site URL. Used by QR code parsers (`isValidOrigin`) to prevent malicious foreign QR redirects, and for webhook callbacks. |
| `NEXT_PUBLIC_E2E` | Optional | `0` \| `1` | Enables internal test hooks (such as exposing `window.__qrScannerModalState`) for automated Playwright / E2E tests. Should remain unset or `0` in production. |
| `NEXT_PUBLIC_SUPABASE_URL` | **Yes** | `https://<ref>.supabase.co` | Supabase project API URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Yes** | JWT anon string | Supabase anonymous / public key. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | JWT secret string | Supabase service-role administrative key. Never exposed to browser. |

---

## Production Deployment Checklist

Before taking the application live, verify each item:

### 1. Database & Migrations
- [ ] Run all migrations in `supabase/migrations/` sequentially up to `20261025010000_trusted_wifi_cooldown.sql`.
- [ ] Verify Row Level Security (RLS) is enabled on all tables (`tables`, `table_sessions`, `soft_hold_cooldowns`, `reservations`, `rate_limits`).
- [ ] Ensure public execution is revoked from sensitive RPCs (`sweep_reservations`, `check_rate_limit`).

### 2. Environment Variables Configuration
- [ ] Set `NODE_ENV=production`.
- [ ] Set `TRUSTED_IP_HEADER=vercel` (if hosting on Vercel) or `TRUSTED_IP_HEADER=netlify` (if hosting on Netlify).
- [ ] Generate and set a high-entropy secret for `IP_HASH_SECRET` (e.g., `openssl rand -hex 32`).
- [ ] Set `NEXT_PUBLIC_SITE_URL` to your production domain (e.g. `https://kopi-nako.com`).
- [ ] Confirm `NEXT_PUBLIC_E2E` is unset or `0`.
- [ ] Set Supabase URL and service role / anon keys.

### 3. Storage Buckets
- [ ] Verify Supabase Storage buckets exist:
  - `payment-proofs` (private bucket for customer reservation bank transfer slips)
  - `menu-images` (public bucket for food/beverage photography)
  - `qris-codes` (public bucket for branch static QRIS images)

### 4. Admin Setup & Branch Wi-Fi Registration
- [ ] Create the superadmin user account via `npm run create-admin` or Supabase Auth.
- [ ] Log in to `/admin` and configure branch settings (opening hours, soft hold minutes, cooldown minutes).
- [ ] Connect a laptop/phone directly to the **cafe Wi-Fi router** (not cellular data or home Wi-Fi).
- [ ] Open **Branches** in Admin, open the branch edit modal, and click **Daftarkan Wi-Fi Ini** with a descriptive label (e.g., `Wi-Fi Bar / Kasir`).
- [ ] Verify up to 5 Wi-Fi entries can be managed and deleted as needed.

### 5. Automated Verification
- [ ] Run security test suite:
  ```bash
  npm run test:security
  ```
- [ ] Run TypeScript typecheck:
  ```bash
  npm run typecheck
  ```
- [ ] Run Playwright QR scanner specs:
  ```bash
  npm run test:scanner
  ```
