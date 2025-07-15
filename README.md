````markdown
# Smokers Haven Inventory

A responsive inventory management system tailored for **Smokers Haven**, designed to streamline product tracking, monitor expiry dates, provide stock level alerts, and enforce secure access via PIN-based authentication.

## Live Demo

[sh-stock-tracking.vercel.app](https://sh-stock-tracking.vercel.app)

## Features

- **Secure Authentication**
  - 6-digit PIN-based login screen on app start
  - Session lasts for 15 minutes, with automatic sign-out on expiry
- **Product Tracking**  
  Maintain detailed records of products (flavor, store & home quantities).
- **Expiry Date Monitoring**  
  Automatically calculate days left until expiry and flag items that have expired or are expiring soon.
- **Stock Level Alerts**  
  Highlight products with low stock (“Need to Order”) versus those in good standing.
- **Search & Filter**  
  Quickly find products by flavor using the search bar.
- **Debounced Updates & Notifications**  
  Editing a quantity sends debounced writes to Firestore and shows toast feedback.

## Technologies

- **Next.js** (React framework for SSR & SSG)
- **TypeScript** (for type safety)
- **React** (UI components)
- **Firebase**
  - **Authentication** for PIN login & session management
  - **Firestore** for real-time product data
- **CSS Modules** (component-scoped styling)
- **react-hot-toast** for in-app notifications

## Getting Started

1. **Clone the repository**
   ```bash
   git clone https://github.com/rob2rhyme/sh-stock-tracking.git
   cd sh-stock-tracking
   ```
````

2. **Install dependencies**

   ```bash
   npm install
   # or
   yarn
   ```

3. **Configure Firebase**

   - Create a Firebase project with **Authentication** and **Firestore** enabled.
   - In your project root, create a `.env.local` with:

     ```env
     NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
     NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
     NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
     NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
     NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
     NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
     ```

   - In Firestore, under `pinAuth/userPin`, store:

     ```json
     {
       "pin": "123456",
       "isValid": true
     }
     ```

4. **Run the development server**

   ```bash
   npm run dev
   # or
   yarn dev
   ```

   Visit [http://localhost:3000](http://localhost:3000). You’ll be prompted to enter your 6-digit PIN before accessing any page.

5. **Build for production**

   ```bash
   npm run build
   npm start
   # or
   yarn build && yarn start
   ```

## Project Structure

```
sh-stock-tracking/
├── public/
├── src/
│   ├── components/         # Reusable React components (e.g. TabPanel, Footer)
│   ├── context/            # AuthContext for session management
│   ├── pages/              # Next.js page routes (including login.tsx)
│   ├── styles/             # CSS Modules (e.g. TabPanel.module.css, Footer.module.css)
│   ├── types.ts            # TypeScript types (e.g. Product)
│   └── utils/              # Firebase client & helpers
├── .env.local              # Firebase configuration (not committed)
├── .gitignore
├── next.config.js
├── tsconfig.json
├── package.json
├── package-lock.json
├── README.md
└── vercel.json
```

## Key Components

- **AuthContext** (`src/context/AuthContext.tsx`)
  Manages 15-minute session, auto-logout on expiry, and exposes `isAuthenticated`, `authenticate()`, and `signOut()`.
- **Login Page** (`src/pages/login.tsx`)
  PIN entry modal that redirects back to the requested page after successful login.
- **TabPanel** (`src/components/TabPanel.tsx`)
  Displays inventory tables with inline editing (protected by authentication) and debounced Firestore writes.
- **Footer** (`src/components/Footer.tsx`)
  Shows dynamic copyright.

## Configuration

- **`next.config.js`**

  - React strict mode enabled
  - Image domains whitelisted (e.g. Firebase Storage)

- **`tsconfig.json`**
  TypeScript compiler options (paths, strictness).
- **`vercel.json`**
  Vercel deployment settings.

## Contributing

Contributions are welcome! Please fork the repo and open a pull request:

1. Fork →
2. Create feature branch (`git checkout -b feature/YourFeature`) →
3. Commit changes (`git commit -m "Add YourFeature"`) →
4. Push to branch (`git push origin feature/YourFeature`) →
5. Open a Pull Request

## License

This project is open–sourced under the [MIT License](LICENSE).

```

```
## Use Application Default Credentials
 ```bash
   gcloud auth application-default login
   # And Then
   npx tsx scripts/syncCategoryImages.ts
   ```
