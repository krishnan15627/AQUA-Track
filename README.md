# AquaTrack — Smart Water Can Management System

AquaTrack is a full-stack web application for small water-can delivery businesses to manage customers, orders, deliveries, reusable water cans, payments, and stock.

Built with **HTML5, CSS3, Vanilla JavaScript, Node.js, Express.js, Supabase (PostgreSQL), and Chart.js**.

---

## ✨ Features

- **Card 1: Login & Signup** — Customer self-registration plus email/phone + password login, password visibility toggle, and session handling. There are no demo accounts.
- **Card 2: Main Owner Dashboard** — Live PostgreSQL metrics: total orders, delivered, pending delivery, empty cans pending, weekday delivery chart, quick actions, recent orders.
- **Card 3: Customer Management** — Search, status filters, status toggle, unreturned empty can balance, customer IDs, Add/Edit modals with cascading snapshot updates.
- **Card 4: Order Management** — Filter tabs (All, Scheduled, Out for Delivery, Delivered, Missed, Cancelled), order creation with expected empty returns, driver assignment at creation time.
- **Card 5: Delivery Management** — Daily delivery list, ID-based driver assignment, delivery completion with drop-off verification.
- **Card 6: Full & Empty Can Inventory** — Live stock: Full, Empty, With Staff, Damaged and Total Cans; strict balance formula: `New unreturned cans = Old balance + Delivered − Returned`.
- **Card 7: Payment Management** — Ledger with total due, paid, remaining balance, UPI/Cash, and live summary totals.
- **Card 8: Reports & Analytics** — Overview, sales trend line chart, payment status doughnut chart, CSV export.
- **Card 9: Customer Portal** — Personal view with next scheduled delivery, outstanding empty bottles, and dues.
- **Card 10 & 11: Delivery Staff Portal** — Driver route assignments with one-click Delivered/Failed and empty can intake.

### Roles & data isolation

| Role | Can access | How the account is created |
|---|---|---|
| **owner** | Everything: dashboard, customers, orders, deliveries, inventory, payments, reports, driver portal | Bootstrap account created by `npm run seed` |
| **staff** | Driver portal with only deliveries assigned to them | Owner uses **+ Add Driver** on the Driver Portal |
| **customer** | Customer portal, own orders, own payments | Self signup on the login page |

Self sign-up is for customers only — the signup form has no role or invite-code fields. Owner and delivery partner accounts can never be self-registered; the API rejects any signup request that specifies a non-customer role.

Isolation is enforced in the API, not just the UI:

- Customers are linked to a `customers` row by unique email (fallback: phone). `customerRef` is embedded in their JWT.
- Customer requests for customers, orders, deliveries, and payments are scoped to their own records.
- Staff requests only return deliveries where `delivery_person_id` matches their user id (name fallback for legacy rows).
- Owner-only routes reject other roles with `403`.

---

## 🛠️ Technology Stack

- **Frontend:** HTML5, CSS3, Vanilla JavaScript (Inter typography, responsive layouts)
- **Backend:** Node.js, Express.js
- **Database:** Supabase PostgreSQL via `@supabase/supabase-js` (in-memory fallback when unconfigured)
- **Authentication:** bcrypt password hashing + JSON Web Tokens (JWT) in httpOnly cookies
- **Data Visualizations:** Chart.js 4 (Bar, Line, and Doughnut charts)
- **Configuration:** Managed via `.env`

---

## 📁 Project Directory Structure

```
aquatrack/
├── .env.example
├── .env
├── .gitignore
├── package.json
├── README.md
├── supabase/
│   └── schema.sql              # Tables, indexes, updated_at triggers, RLS
├── public/
│   ├── css/
│   │   ├── style.css           # Global theme tokens and utilities
│   │   ├── auth.css            # Login / signup UI
│   │   └── dashboard.css       # Dashboard design (Cards 2-11)
│   ├── js/
│   │   ├── api.js              # REST client & session manager
│   │   ├── auth.js             # Login / signup controller & validation
│   │   └── app.js              # SPA router, Chart.js, modals & portals
│   ├── login.html              # Login + customer signup page
│   └── index.html              # Multi-view dashboard (Cards 2-11)
└── src/
    ├── app.js                  # Express app setup and route mounting
    ├── server.js               # HTTP server entrypoint
    ├── config/
    │   └── supabase.js         # Supabase client & connection check
    ├── controllers/
    │   ├── authController.js   # Login, customer signup, me, logout
    │   ├── userController.js   # Owner: list/create driver accounts
    │   ├── customerController.js
    │   ├── orderController.js
    │   ├── deliveryController.js
    │   ├── inventoryController.js
    │   ├── paymentController.js
    │   └── reportController.js
    ├── middleware/
    │   ├── authMiddleware.js   # JWT protect, role authorize, customer linkage
    │   └── errorHandler.js     # Centralized error handler
    ├── routes/
    │   ├── authRoutes.js
    │   ├── userRoutes.js
    │   ├── customerRoutes.js
    │   ├── orderRoutes.js
    │   ├── deliveryRoutes.js
    │   ├── inventoryRoutes.js
    │   ├── paymentRoutes.js
    │   └── reportRoutes.js
    └── utils/
        ├── customerCodes.js    # Customer code sequence (DB or memory)
        ├── customerLink.js     # User ↔ customer linkage (email / phone)
        ├── staff.js            # Driver lookup by id or name
        ├── dataStore.js        # Empty in-memory fallback
        ├── supabaseHelpers.js  # Row mapping (snake_case ↔ camelCase), errors
        └── seed.js             # Bootstrap owner + inventory row only
```

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env`:
```env
PORT=3000
JWT_SECRET=change_me
NODE_ENV=development
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```
The service-role key is **server-side only** — never expose it in `public/` or the browser.

### 3. Create the Schema and Bootstrap the Owner
Run `supabase/schema.sql` in the Supabase SQL Editor, then:
```bash
npm run seed
```
This only creates/updates the owner account and ensures the inventory row exists. It does **not** insert customers, orders, deliveries, or payments, and it never clears business data.

The bootstrap owner is:
- **Email:** `admin@aquatrack.com`
- **Password:** `Password@123`

Change this password after the first login (or update it in `src/utils/seed.js` before seeding). Customers create their own accounts from the login page; drivers are created by the owner under **Driver Portal → + Add Driver**.

### 4. Run the Server
```bash
npm start
```
Or for development with automatic restart:
```bash
npm run dev
```

### 5. Open in Browser
- **Login / Signup:** [http://localhost:3000/login](http://localhost:3000/login)
- **Dashboard:** [http://localhost:3000/dashboard](http://localhost:3000/dashboard)

---

## 🗺️ Google Maps (Customer Portal)

The customer portal has a **"Aqua Shops Near You"** section: an embedded Google Map with markers for each pickup shop, info windows showing live distance plus **Directions** and **Call** links, a **"Use my exact location"** button that centers the map on the customer (browser geolocation, HTTPS required in production), and a nearby-shop list sorted by distance (Haversine). Clicking a shop name in the list flies the map to that shop. Until a key is configured, the section gracefully degrades to a dashed panel explaining how to enable the map — the list and distances still work.

Shops are defined in `WATER_CAN_CENTERS` at the top of `public/js/app.js` — replace the sample coordinates with your real shop names, phones, and locations.

### Getting and restricting the API key

1. In the [Google Cloud Console](https://console.cloud.google.com/), create a project and enable **billing** (required for the Maps API).
2. Enable the **Maps JavaScript API** (APIs & Services → Library).
3. Create an API key (APIs & Services → Credentials → Create Credentials → API Key).
4. Restrict the key:
   - **Application restriction:** HTTP referrers — add `http://localhost:3000/*` (and `http://127.0.0.1:3000/*`) plus your production domain, e.g. `https://yourdomain.com/*`.
   - **API restriction:** only the **Maps JavaScript API**.
   
   The key is served to the browser via `GET /api/config`, so these restrictions are what keep it safe.
5. Set it in `.env`:
   ```env
   MAPS_BROWSER_KEY=AIza...
   ```
6. Restart the server (`npm start`). Without a key (or with an invalid/restricted one), the fallback panel is shown instead of the map.

---

## 🔐 Security Notes

- Passwords are hashed with bcrypt; JWTs are stored in httpOnly cookies.
- Supabase RLS is enabled with no public policies. Only the backend talks to the database using the service-role key.
- Authorization is checked per route (`protect` + `authorize`) and again inside controllers for row-level scoping.
- Rotate `SUPABASE_SERVICE_ROLE_KEY` and the database password if they are ever shared or committed.
