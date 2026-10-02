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
| Auth | Session login (HttpOnly cookie, CSRF token, optional TOTP 2FA) on all admin API routes |

---

## Project structure

```
server.js                  Express app — routes, PayFast, email, SEO meta injection
src/
  db/
    models.js              Mongoose schemas (Settings, Product, Order, Category, ...)
    connection.js           MongoDB connect with capped-backoff auto-retry
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

**Requires Node 18+** (the email integration uses the native `fetch`/`AbortController` APIs).

```bash
npm install
cp .env.example .env       # then fill in the values below
npm run build               # builds public/build/bundle.js + bundle.css
npm start                   # node server.js → http://localhost:3000
```

The server will refuse to start (`FATAL`, exit 1) without `ADMIN_USER` plus `ADMIN_PASS_HASH` (or `ADMIN_PASS`) and a matching PayFast credential pair for whichever `PAYFAST_SANDBOX` mode is active. Everything else is optional and feature-gates itself off when unset.

Admin panel: `http://localhost:3000/admin` — sign in with the credentials from `.env` (see **Admin security** below).

There's no `dev` script wired to `nodemon` in `package.json` despite it being a devDependency — during active backend development, run `npx nodemon server.js` directly, or rebuild (`npm run build`) after frontend changes and restart `npm start`.

---

## Environment variables

See [`.env.example`](.env.example) for the full annotated list. Summary:

### Required
| Variable | Purpose |
|---|---|
| `ADMIN_USER` + `ADMIN_PASS_HASH` (or `ADMIN_PASS`) | Admin sign-in. Generate the hash with `node scripts/hash-password.js "<passphrase>"` |
| `ADMIN_TOTP_SECRET` | Optional but recommended: require an authenticator-app code at sign-in (`node scripts/totp-secret.js`) |
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

Eleven sections, all behind the sign-in page:

**Dashboard** · **Products** (variant stock matrix, per-color images) · **Categories** · **Orders** (status pipeline, manual shipping-details capture, PDF invoice export) · **Status** (DB/Cloudinary/email health, live diagnostics) · **Lookbook** · **Community** · **Pages** (Shipping & Returns / FAQ / Contact content) · **Subscribers** · **Newsletter** (rich-text broadcast with per-recipient sending and one-click unsubscribe) · **Settings** (branding, colors, SEO defaults, email templates, maintenance mode).

Most sections save via a full-data-blob endpoint (`GET`/`POST /api/data`); Orders and a few others use dedicated REST endpoints instead so a slow full-blob save from one open admin tab can't clobber a fast-moving field (like order status) changed from another.

---

## Order fulfillment

Checkout deducts stock per size/color variant atomically (a conditional `$inc` guard), so two simultaneous checkouts can't both claim the last unit of the same variant. PayFast confirms payment via a server-to-server ITN webhook, independently verified against PayFast's own servers rather than trusted at face value.

Shipping is handled manually. Once an order is paid, the admin Orders tab shows the customer's delivery address (also stored as separate street/city/province/postal-code fields) so the parcel can be packed and sent by hand. Marking an order **shipped** lets the admin enter a carrier, tracking number and estimated delivery, which are emailed to the customer.

---

## Admin security

- **Sign-in page** at `/admin` (no browser Basic Auth prompt). Credentials are compared in constant time; failures return one generic message after a small random delay.
- **Sessions:** a random 256-bit id in an `HttpOnly`, `SameSite=Strict` cookie (`__Host-` prefixed and `Secure` on HTTPS), regenerated on every sign-in, expiring after 30 minutes idle / 12 hours total, revocable via **Sign out**. They live in server memory, so a restart signs you out.
- **CSRF:** every write must carry the session's `X-CSRF-Token` (added automatically by the admin app).
- **Brute-force limits:** 8 failed sign-ins per IP per 15 minutes, then locked out; the admin is emailed and the attempt is logged (**Site status → System logs**).
- **Two-factor (optional, recommended):** set `ADMIN_TOTP_SECRET`. Each code works once; a wrong password doesn't burn your code.
- **Strict CSP** on admin pages (scripts only from this site; the PDF libraries are self-hosted in `public/vendor/`), no framing, `noindex`.
- `/api/data` only returns orders, subscribers and admin-only settings to a signed-in admin.

## Media & performance

- **Images:** every Cloudinary image is served through `<Img>` (`src/components/Img.svelte`): responsive `srcset`/`sizes`, AVIF/WebP via `f_auto`, `q_auto`, lazy-loaded and async-decoded, with a fade-in. The hero and main product/article image are `priority` (eager, high fetch priority), and the home hero is also preloaded from the server-rendered HTML.
- **Video:** `<Video>` serves the best codec at 1280/1920px with a poster frame; background videos pause when off-screen and fall back to the poster on Data Saver, 2G or reduced-motion; player videos download nothing until played. YouTube embeds load as a thumbnail and only fetch the real player on click.
- **Editor content** (articles, shipping page) is rewritten on display so its images/videos/iframes get the same treatment.
- **Uploads:** the browser re-encodes photos over ~1.2 MB to WebP (max 2560px) before uploading; Cloudinary also caps stored images at 2560px and pre-generates the video renditions the site requests.
- **Emails** use size-capped JPEG/PNG renditions (no WebP/AVIF, which many mail clients can't show). The admin uses small thumbnails everywhere.
- **Delivery:** responses are gzip/brotli-compressed, the JS bundle is minified (~1 MB → ~330 KB), vendor libs are cached for 30 days, and the Cloudinary connection is opened early with `preconnect`.

## Logs & backups

- **Sign-in audit trail:** every sign-in, failed attempt, lockout, sign-out and log download is recorded in **Site status → System logs** with the device (browser, OS, desktop/mobile) and IP. A sign-in from a browser/OS combination you haven't used before is flagged **New device** and emailed to you.
- **Automatic backups:** system logs are snapshotted daily (incremental, gzip JSON) into a separate `logbackups` collection and kept 180 days.
- **Weekly summary email:** every week you get a digest of the last 7 days — revenue and orders (vs the week before), top products, sign-ins by device, payment and error counts — with a **Flagged this week** list for anything suspicious: failed or locked-out sign-ins, new devices or IPs, late-night sign-ins, cleared logs, forged-looking PayFast notifications, error spikes, failed emails, unusual orders. The new log entries are attached as the off-site backup. Preview or send it any time from **Site status**; disable with `LOG_BACKUP_EMAIL=false`.
- **Manual:** **Back up now** and per-backup **Download** on the Site status page. **Clear** always saves a backup first.

## Realtime & notifications

- The admin keeps a Server-Sent Events stream (`/api/admin/events`) open: new checkouts, payments and status changes appear instantly, with a toast, a chime and (if enabled) a desktop notification. A 30-second poll is the fallback if a proxy blocks the stream.
- **Site status → Notifications** has a **Send test email** button and warns if you're still on Resend's sandbox sender (which can only deliver to your own Resend account — verify a domain and set `SMTP_FROM` before expecting customers to get emails).
- Skipped or failed admin emails are logged, not silent.

## Resilience

- **MongoDB down or unreachable:** the connection layer retries with capped exponential backoff (5s → up to 60s) rather than giving up after one failed attempt. While disconnected, public traffic sees a maintenance page (email collection optional) instead of a broken site; `/admin` still loads so you can see what's happening.
- **Unhandled server errors:** logged to MongoDB (inspectable from the admin Status tab) and, if `ADMIN_EMAIL`/`RESEND_API_KEY` are set, emailed to the admin — throttled to once per 15 minutes so a recurring error doesn't flood the inbox.
- **Cross-origin mutation guard:** state-changing requests (`POST`/`PATCH`/`DELETE`) are rejected if their `Origin`/`Referer` doesn't match the request host — defence in depth for the admin session, alongside its `SameSite=Strict` cookie and per-session CSRF token. PayFast's ITN webhook and the newsletter one-click-unsubscribe callback are explicitly exempted, since neither is a browser request and both are independently verified another way.

---

## Deployment

Currently deployed on **Render.com**. A `Dockerfile` and `fly.toml` also exist from an earlier Fly.io deployment target — not actively used, but left in place.

```bash
npm run build   # produces public/build/bundle.js + bundle.css
npm start        # serves the built SPA + API from one process
```

Set every environment variable from `.env.example` in the hosting platform's dashboard — nothing is read from a committed file in production.
