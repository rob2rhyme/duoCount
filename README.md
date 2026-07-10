# Inventory Management System — Next.js + Firebase

A responsive, real-time inventory tracker for small retail businesses. Track
stock across two locations (e.g. front-of-store and back stockroom), monitor
expiry dates, get low-stock alerts, and manage everything behind a secure
phone-OTP login. Fully **white-label** — rebrand the whole app from a single
config file.

> 📘 **Buyers:** open [`documentation/index.html`](documentation/index.html) in
> your browser for the complete, step-by-step setup guide.

## Features

- **Real-time sync** — inventory updates instantly across all devices via Firestore.
- **Two-location stock** — track quantities in two places per item, with a live total.
- **Status & expiry alerts** — automatic "Need to Order" and "Expiring Soon" flags with colour coding.
- **Category grid** — visual, image-backed category cards with per-category stock summaries.
- **Search & filter** — filter categories by type and items by status; search by name.
- **Inline editing** — tap a quantity to edit it; changes save to Firestore with toast feedback.
- **Add products** — add items to any category from an in-app modal.
- **Secure OTP login** — Firebase phone authentication with a configurable auto sign-out timeout.
- **White-label** — app name, logo, author, terminology, filters and thresholds all come from one config file.
- **Responsive** — works on phones, tablets and desktop.

## Tech stack

- **Next.js** (Pages Router) + **React 19** + **TypeScript**
- **Firebase** — Authentication (phone OTP) & Cloud Firestore
- **CSS Modules** for component-scoped styling
- **react-hot-toast** for notifications

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Configure Firebase
cp .env.example .env.local
#   → fill in your Firebase web config (Console → Project settings → Your apps)

# 3. (Optional) seed demo data — see scripts/seed.ts for credential setup
npm run seed

# 4. Run the dev server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000). You'll be asked to sign
in with a one-time code before you can access the inventory.

### Firebase setup (summary)

1. Create a Firebase project; enable **Authentication → Phone** and **Cloud Firestore**.
2. Add a **Web app** and copy its config into `.env.local` (see `.env.example`).
3. Deploy the included security rules: `firebase deploy --only firestore:rules`.
4. In Firestore, create `phoneAuth/store` with a `phone` field (E.164, e.g. `+15551234567`) — the number the login screen sends the code to. `npm run seed` can do this for you via the `LOGIN_PHONE` env var.

Full instructions, including screenshots-ready steps and troubleshooting, are in
[`documentation/index.html`](documentation/index.html).

## White-labeling

Everything brand- and business-specific lives in **`src/config/app.config.ts`**:

```ts
appName, shortName, tagline, logoSrc, author,
sessionTimeoutMinutes,
labels: { item, itemPlural, category, front, back, ... },
thresholds: { lowStock, expiringSoonDays },
categoryFilters: [...]
```

Change these values (and drop your logo in `/public`) to rebrand the entire app
— no component code to touch.

## Project structure

```
├── data/
│   └── sample-inventory.json     # demo catalogue used by the seed script
├── documentation/
│   └── index.html                # full buyer documentation
├── public/                       # logo, favicon
├── scripts/
│   └── seed.ts                   # one-command demo-data seeder
├── src/
│   ├── components/               # UI components (grid, table, modals, search…)
│   ├── config/
│   │   └── app.config.ts         # ⭐ white-label configuration
│   ├── context/                  # AuthContext (session + auto sign-out)
│   ├── hooks/                    # useProducts / useCategories
│   ├── pages/                    # Next.js routes (index, login, _app)
│   ├── styles/                   # CSS Modules + globals
│   ├── types.ts                  # shared TypeScript types
│   └── utils/                    # Firebase client + helpers
├── .env.example
├── firestore.rules
└── firebase.json
```

## Deployment

Deploy the Next.js app to **Vercel** (recommended) or any Node host, and deploy
Firestore rules with the Firebase CLI. Step-by-step instructions for both are in
the documentation.

## License

Commercial license — see [`LICENSE`](LICENSE). Distributed via CodeCanyon under
the Envato Market licenses.
