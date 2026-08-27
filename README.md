# Others.

A Svelte 5 + Express 5 e-commerce storefront and admin panel, backed by MongoDB.
Single codebase, single deploy: Express serves both the API and the built SPA.

> Looking for a chronological log of past feature work? See [`walkthrough.md`](walkthrough.md).
> This file documents the project as it stands today.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Svelte 5 (runes), Tailwind CSS, hand-rolled client-side router (no `svelte-routing` in use despite the dependency) |
| Backend | Express 5, Mongoose 9 / MongoDB |
| Bundler | Rollup |
| Images/video | Cloudinary |
| Payments | PayFast (South African gateway) |
| Transactional email | Resend (HTTPS API — not SMTP) |
| Courier fulfillment | Courier Guy, via the Ship Logic API |
| Auth | HTTP Basic Auth on `/admin*` and all admin API routes |

---

## Project structure

```
server.js                  Express app — routes, PayFast, email, SEO meta injection
src/
  db/
    models.js              Mongoose schemas (Settings, Product, Order, Category, ...)
    connection.js           MongoDB connect with capped-backoff auto-retry
  services/
    courierGuy.js           Ship Logic API client (rates, shipments, tracking)
  lib/                       Frontend-only helpers (storeData fetch/cache, cloudinary URLs, motion)
  App.svelte                 Client-side router root
  pages/                     One component per route (Index, Shop, Product, Cart, Admin, ...)
  components/
    admin/                   Admin panel — one component per section (see below)
    ...                      Shared storefront components (Navbar, Footer, ProductCard, ...)
public/
  index.html                 Static SPA shell + critical CSS + font preconnects
  build/                     Rollup output (bundle.js / bundle.css) — generated, not committed
scripts/migrate.js           One-off data migration script
```

---

## Getting started

**Requires Node 18+** (the email and courier integrations use the native `fetch`/`AbortController` APIs).

```bash
npm install
cp .env.example .env       # then fill in the values below
npm run build               # builds public/build/bundle.js + bundle.css
npm start                   # node server.js → http://localhost:3000
```

The server will refuse to start (`FATAL`, exit 1) without `ADMIN_USER`/`ADMIN_PASS` and a matching PayFast credential pair for whichever `PAYFAST_SANDBOX` mode is active. Everything else is optional and feature-gates itself off when unset.

Admin panel: `http://localhost:3000/admin` (HTTP Basic Auth, credentials from `.env`).

There's no `dev` script wired to `nodemon` in `package.json` despite it being a devDependency — during active backend development, run `npx nodemon server.js` directly, or rebuild (`npm run build`) after frontend changes and restart `npm start`.

---

## Environment variables

See [`.env.example`](.env.example) for the full annotated list. Summary:

### Required
| Variable | Purpose |
|---|---|
| `ADMIN_USER`, `ADMIN_PASS` | HTTP Basic Auth credentials for `/admin*` |
| `PAYFAST_SANDBOX` | `true`/`false` — selects which credential pair below is read |
| `PAYFAST_MERCHANT_ID_SANDBOX` / `_LIVE`, `PAYFAST_MERCHANT_KEY_SANDBOX` / `_LIVE` | Whichever pair matches the active mode |

### Strongly recommended
| Variable | Purpose |
|---|---|
| `MONGODB_URI` | Falls back to `mongodb://localhost:27017/others` if unset — fine for local dev, breaks on any hosted platform |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Product/lookbook/community image and video uploads |

### Optional — feature-gated
| Variable | Enables |
|---|---|
| `RESEND_API_KEY`, `SMTP_FROM`, `ADMIN_EMAIL`, `UNSUBSCRIBE_SECRET` | Order-status emails, admin notifications, newsletter broadcasts, critical-error alerts |
| `COURIER_GUY_API_KEY` (or `COURIER_GUY`), `COURIER_GUY_SANDBOX` | Admin-side Courier Guy shipment booking, tracking, and label/sticker retrieval |
| `PAYFAST_PASSPHRASE_SANDBOX` / `_LIVE` | Only if your PayFast account has a passphrase configured |

Missing MongoDB doesn't crash the server — see **Resilience** below.

---

## Public site

| Route | Notes |
|---|---|
| `/` | Home |
| `/shop` | Product listing — category, size, "new arrivals", and price-sort filters, all synced to the URL query string (shareable/bookmarkable) |
| `/shop/:id` | Product detail — per-variant (size × color) stock, per-color image galleries |
| `/lookbook`, `/lookbook/:id` | Lookbook grid + detail with lightbox |
| `/community`, `/community/:slug` | Editorial articles |
| `/cart` | Cart → checkout → PayFast redirect → success/cancel |
| `/shipping-returns`, `/faq`, `/contact` | Admin-editable content pages |

Every one of these has a matching server-side route in `server.js` (not just the SPA's client router) purely to inject real `<title>`/`<meta>`/Open Graph tags into the initial HTML response — a client-rendered SPA's `<svelte:head>` tags are invisible to crawlers and link-preview bots, which don't execute JavaScript.

---

## Admin panel

Eleven sections, all under HTTP Basic Auth:

**Dashboard** · **Products** (variant stock matrix, per-color images, optional shipping weight/dimensions) · **Categories** · **Orders** (status pipeline, shipping-details capture, Courier Guy fulfillment, PDF invoice export) · **Status** (DB/Cloudinary/email health, live diagnostics) · **Lookbook** · **Community** · **Pages** (Shipping & Returns / FAQ / Contact content) · **Subscribers** · **Newsletter** (rich-text broadcast with per-recipient sending and one-click unsubscribe) · **Settings** (branding, colors, SEO defaults, email templates, Courier Guy collection address, maintenance mode).

Most sections save via a full-data-blob endpoint (`GET`/`POST /api/data`); Orders and a few others use dedicated REST endpoints instead so a slow full-blob save from one open admin tab can't clobber a fast-moving field (like order status) changed from another.

---

## Order fulfillment

Checkout deducts stock per size/color variant atomically (a conditional `$inc` guard), so two simultaneous checkouts can't both claim the last unit of the same variant. PayFast confirms payment via a server-to-server ITN webhook, independently verified against PayFast's own servers rather than trusted at face value.

Once an order is paid, the admin Orders tab can hand it to **Courier Guy** for physical fulfillment:
1. Fetch live rates for the order's parcel (weight summed from real per-product weights where set, falling back to a site-wide default; box dimensions from the site default).
2. Pick a service level and book the shipment.
3. Print the waybill label or parcel sticker, track status, or cancel — all against the real Ship Logic API (sandbox or live, per `COURIER_GUY_SANDBOX`).

This requires the store's own pickup address to be filled in under **Settings → Courier Guy** first — that's the *collection* address Courier Guy picks up from, distinct from each order's delivery address.

---

## Resilience

- **MongoDB down or unreachable:** the connection layer retries with capped exponential backoff (5s → up to 60s) rather than giving up after one failed attempt. While disconnected, public traffic sees a maintenance page (email collection optional) instead of a broken site; `/admin` still loads so you can see what's happening.
- **Unhandled server errors:** logged to MongoDB (inspectable from the admin Status tab) and, if `ADMIN_EMAIL`/`RESEND_API_KEY` are set, emailed to the admin — throttled to once per 15 minutes so a recurring error doesn't flood the inbox.
- **Cross-origin mutation guard:** state-changing requests (`POST`/`PATCH`/`DELETE`) are rejected if their `Origin`/`Referer` doesn't match the request host — mitigates a malicious page riding an admin's cached Basic Auth credentials. PayFast's ITN webhook and Courier Guy's one-click-unsubscribe callback are explicitly exempted, since neither is a browser request and both are independently verified another way.

---

## Deployment

Currently deployed on **Render.com**. A `Dockerfile` and `fly.toml` also exist from an earlier Fly.io deployment target — not actively used, but left in place.

```bash
npm run build   # produces public/build/bundle.js + bundle.css
npm start        # serves the built SPA + API from one process
```

Set every environment variable from `.env.example` in the hosting platform's dashboard — nothing is read from a committed file in production.
