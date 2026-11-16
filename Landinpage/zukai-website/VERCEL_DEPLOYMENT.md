# Deploying Zukai Landing Page to Vercel

This landing page is built with **TanStack Start**, **Vite**, **Tailwind CSS v4**, and **Nitro**. When building on Vercel (`VERCEL=1`), Nitro automatically compiles the project using the **Vercel Build Output API (v3)** into `.vercel/output` (serverless SSR function + edge-cached static assets).

---

## 🚀 Option 1: Deploy via Vercel Dashboard (GitHub Integration)

1. **Push your code to GitHub**:
   Ensure all changes in `Landinpage/` are committed and pushed to your GitHub repository.

2. **Import Project in Vercel**:
   - Go to [Vercel Dashboard](https://vercel.com/dashboard) and click **"Add New..." → "Project"**.
   - Select your repository (`hey-nivesh/Zukai`).

3. **Configure Project Settings**:
   - **Root Directory**: Click **Edit** and set it to:
     ```
     Landinpage/zukai-website
     ```
     *(This is essential because the dependencies, Vite config, and Nitro build reside in this subfolder).*
   - **Framework Preset**: Select **Other** (or keep auto-detected).
   - **Build Command**: `npm run build` (Default)
   - **Output Directory**: Leave empty or default (Nitro automatically produces `.vercel/output`).
   - **Install Command**: `npm install` (Default)

4. **Add Environment Variables**:
   Under **Environment Variables**, add the following (see `.env.example`):

   | Variable Name | Value | Description |
   | :--- | :--- | :--- |
   | `VITE_SUPABASE_URL` | `https://<your-project>.supabase.co` | Supabase project URL |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` | Supabase publishable key |
   | `SUPABASE_URL` | `https://<your-project>.supabase.co` | Server-side Supabase URL |
   | `SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` | Server-side Supabase publishable key |
   | `LOVABLE_API_KEY` *(Optional)* | Your key | Required only if using owner email notifications |
   | `GOOGLE_MAIL_API_KEY` *(Optional)*| Your key | Required only if using Gmail connector |

5. **Deploy**:
   Click **Deploy**. Vercel will install dependencies, build the client bundle and Nitro SSR server function, and deploy your site with global edge CDN caching.

---

## ⚡ Option 2: Deploy via Vercel CLI

From your terminal:

```bash
cd Landinpage/zukai-website
npx vercel
```

Follow the prompts:
- Set up and deploy: **Yes**
- Which scope: *(Select your personal or team account)*
- Link to existing project: **No** (or link if created)
- Project name: `zukai-website`
- In which directory is your code located: `./`

To deploy directly to production:
```bash
npx vercel --prod
```

---

## 🧪 Local Testing Before Deployment

You can test linting, unit tests, and production builds locally:

```bash
# Run tests
npm test

# Run linter
npm run lint

# Run production build (Vercel target)
cd zukai-website
# On Windows PowerShell:
$env:VERCEL="1"; npm run build

# Preview production build
npm run preview
```

---

## 🛡️ Included Production Optimizations

- **Vercel Build Output API v3**: Native serverless routing configured with SSR fallback and high-performance immutable asset caching.
- **Security Headers**: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy` configured in `vercel.json`.
- **Fault-Tolerant Waitlist Function**: Robust fallback between `SUPABASE_PUBLISHABLE_KEY` and `VITE_SUPABASE_PUBLISHABLE_KEY` with graceful error handling.
- **Prettier & ESLint Clean**: 0 lint errors, 4 unit tests passing, and `.vercel` properly ignored.
