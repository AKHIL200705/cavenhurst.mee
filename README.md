# CAVENHURST

> Premium apparel for everyday movement. Modern, versatile, and long-lasting wardrobe essentials, designed in India.

This repository contains the full-stack web application for CAVENHURST, built with **TanStack Start**, **React 19**, **TypeScript**, **Tailwind CSS**, **Supabase**, and deployed on **Vercel**.

---

## Architecture Overview

```
GitHub Repository ───> Vercel (Edge / Serverless SSR & Functions) ───> Custom Domain (cavenhurst.in)
                              │
                              └───> Supabase (PostgreSQL, Auth, Storage, RLS)
```

- **Frontend & SSR**: TanStack Start + React 19 + Vite + Tailwind CSS
- **Backend & Database**: Supabase (PostgreSQL, GoTrue Auth, Row Level Security, Storage)
- **Deployment**: Vercel (Fluid Compute via Nitro server engine)
- **Payments**: Razorpay (server-side verification)
- **Shipping**: Shiprocket (fulfillment & tracking)

---

## Getting Started

### Prerequisites

- **Node.js**: v20 or later (v22+ recommended)
- **npm**: v10 or later

### Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/<your-username>/cavenhurst.git
cd cavenhurst
npm install
```

### Environment Configuration

Copy the example environment file and configure your credentials:

```bash
cp .env.example .env
```

Edit `.env` with your Supabase credentials:

```ini
# Supabase Client
VITE_SUPABASE_URL="https://your-project-id.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="your-supabase-publishable-key"

# Supabase Server (Server Functions & Admin Client)
SUPABASE_URL="https://your-project-id.supabase.co"
SUPABASE_PUBLISHABLE_KEY="your-supabase-publishable-key"
SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-secret-key"

# Direct PostgreSQL connection string (for migrations)
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-ID].supabase.co:5432/postgres"

# Payments & Shipping
VITE_RAZORPAY_KEY_ID="rzp_test_..."
RAZORPAY_KEY_ID="rzp_test_..."
RAZORPAY_KEY_SECRET="..."
SHIPROCKET_EMAIL="support@cavenhurst.in"
SHIPROCKET_PASSWORD="..."
```

### Local Development

Start the development server with Hot Module Replacement:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) (or the port indicated in your terminal) in your browser.

---

## Scripts Reference

| Command               | Description                                                 |
| --------------------- | ----------------------------------------------------------- |
| `npm run dev`         | Starts the local Vite development server                    |
| `npm run build`       | Builds the client and server bundles for production         |
| `npm run preview`     | Previews the production build locally                       |
| `npm run typecheck`   | Validates TypeScript types across the codebase              |
| `npm run lint`        | Runs ESLint for code quality checks                         |
| `npm run format`      | Formats code with Prettier                                  |
| `npm test`            | Runs the test suite via Vitest                              |
| `npm run db:push`     | Pushes the Drizzle schema directly to the Supabase database |
| `npm run db:generate` | Generates SQL migration files from Drizzle schema           |
| `npm run db:migrate`  | Applies pending database migrations                         |

---

## Supabase Configuration

### 1. Database Setup & Migrations

The database schema and migrations are located in `drizzle/migrations/` and `supabase/migrations/`.

To apply migrations to your Supabase PostgreSQL instance:

1. Obtain your PostgreSQL Connection URI from **Supabase Dashboard** > **Project Settings** > **Database** > **Connection string (URI)**.
2. Set `DATABASE_URL` in `.env`.
3. Run:
   ```bash
   npm run db:push
   ```
   Or apply the SQL scripts directly in the **Supabase SQL Editor**.

### 2. Authentication Setup

In the **Supabase Dashboard** > **Authentication**:

- **Google OAuth**:
  1. Navigate to **Authentication** > **Providers** > **Google**.
  2. Enable Google and enter your Google Cloud OAuth Client ID and Secret.
  3. Add the redirect URL: `https://<your-project-id>.supabase.co/auth/v1/callback` and `https://<your-domain>/login`.
- **Phone OTP**:
  1. Navigate to **Authentication** > **Providers** > **Phone**.
  2. Configure your SMS provider (e.g. Twilio or MessageBird).
- **URL Configuration**:
  1. Set **Site URL** to your production URL (e.g. `https://cavenhurst.in`).
  2. In **Redirect URLs**, add `http://localhost:3000/**`, `https://*.vercel.app/**`, and `https://cavenhurst.in/**`.

### 3. Supabase Storage

Create a public storage bucket for product assets:

- **Bucket Name**: `product-images`
- **Public**: Yes (Read access enabled for public)

---

## Vercel Deployment

### 1. Connect GitHub to Vercel

1. Push this repository to your GitHub account:
   ```bash
   git remote add origin https://github.com/<your-username>/cavenhurst.git
   git push -u origin main
   ```
2. Log into [Vercel](https://vercel.com) and click **Add New...** > **Project**.
3. Import your `cavenhurst` repository.

### 2. Build & Development Settings

Vercel automatically detects the Vite/Nitro setup:

- **Framework Preset**: `Other` (or auto-detected Vite)
- **Build Command**: `npm run build`
- **Output Directory**: `.output` (or auto-configured by Nitro)
- **Install Command**: `npm install`

### 3. Configure Environment Variables in Vercel

In the Vercel project settings, add the following variables under **Settings** > **Environment Variables** (Production and Preview):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `VITE_RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `SHIPROCKET_EMAIL`
- `SHIPROCKET_PASSWORD`
- `CRON_SECRET`

### 4. Custom Domain Setup

1. In your Vercel Project, go to **Settings** > **Domains**.
2. Enter your custom domain (e.g., `cavenhurst.in` and `www.cavenhurst.in`).
3. Add the required DNS records in your domain registrar:
   - **A Record**: `@` points to `76.76.21.21`
   - **CNAME Record**: `www` points to `cname.vercel-dns.com`
4. Once DNS propagates, Vercel automatically issues an SSL certificate.

---

## Security & Best Practices

- **Row Level Security (RLS)** is enabled on all tables: customers can only access their own orders, carts, and account data.
- **Service-Role Key**: Never exposed to browser bundles. Only accessed within server routes and server-side utilities (`client.server.ts`).
- **Server-side Payment Verification**: Razorpay webhooks and payment signatures are cryptographically verified using HMAC SHA256 before orders are marked as paid.
