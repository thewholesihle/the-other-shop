# Others.

A Svelte 5 + Express 5 e-commerce storefront and admin panel, backed by MongoDB.
Single codebase, single deploy: Express serves both the API and the built SPA.

> Looking for a chronological log of past feature work? See [`walkthrough.md`](walkthrough.md).
> This file documents the project as it stands today.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Svelte 5 (runes), Tailwind CSS 4 (theme in `tailwind.config.js`, loaded with `@config`), hand-rolled client-side router |
| Backend | Express 5, Mongoose 9 / MongoDB |
| Bundler | Rollup |
| Images/video | Cloudinary |
| Payments | PayFast and Yoco (South African gateways), each switchable in the admin |
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

The server will refuse to start (`FATAL`, exit 1) without `ADMIN_USER` plus `ADMIN_PASS_HASH` (or `ADMIN_PASS`) (or `ADMIN_PASS`). Everything else is optional and feature-gates itself off when unset — including each payment provider: one with no credentials is simply not offered at checkout (the server warns at startup if neither is configured).

Admin panel: `http://localhost:3000/admin` — sign in with the credentials from `.env` (see **Admin security** below).

`npm run dev` runs the server with Node's built-in watcher (`node --watch`), restarting on backend changes; rebuild with `npm run build` after frontend changes. (`nodemon` was removed: its dependency chain carried an unpatched `braces` advisory, and Node's watcher does the same job.)

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
| `RESEND_API_KEY`, `SMTP_FROM`, `ADMIN_EMAIL`, `UNSUBSCRIBE_SECRET` | Order-status emails, admin notifications, newsletter broadcasts, critical-error alerts. `ADMIN_EMAIL` is the last-resort recipient when no addresses are set in **Settings → Emails & alerts** |
| `VIDEO_MODE` (`auto`), `VIDEO_MAX_MB`, `VIDEO_MAX_MINUTES`, `VIDEO_LITE`, `FFMPEG_PATH` | How videos are optimised (`cloudinary` = Cloudinary does it, `server` = ffmpeg here), upload limits (100 MB in `cloudinary` mode; 500, or 150 on a small server, in `server` mode), forcing the lighter 720p profile, and a custom ffmpeg binary. See **Video uploads** below |
| `PAYFAST_MERCHANT_ID_*`, `PAYFAST_MERCHANT_KEY_*` (`_SANDBOX` / `_LIVE`, chosen by `PAYFAST_SANDBOX`) | PayFast at checkout |
| `PAYFAST_PASSPHRASE_SANDBOX` / `_LIVE` | Only if your PayFast account has a passphrase configured |
| `YOCO_SECRET_KEY_*`, `YOCO_WEBHOOK_SECRET_*` (`_TEST` / `_LIVE`, chosen by `YOCO_SANDBOX`) | Yoco at checkout — see **Payments** below |

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

## Data safety and hardening

- **Admin saves can't undo a customer's purchase.** The admin sends only the documents it changed (plus explicit lists of deleted ids), and the server skips documents identical to what is stored. Before this, saving anything re-wrote every product's stock from a copy loaded earlier, and deleting by "not in the list" also deleted subscribers who signed up in the meantime. Stock edits are merged too: the admin sends the stock it loaded next to the stock it wants, and the server applies only the difference to the live number (loaded 10, a customer buys 2, you restock to 15 → 13, not 15), with a per-product revision counter that retries if a sale lands mid-save.
- **Checkout is tied to the buyer.** Each order gets a secret token, passed only to that browser; cancelling an order or polling its payment state needs it, so knowing an order number (they are timestamps) is no longer enough to cancel someone's checkout. Order numbers are guaranteed unique even for simultaneous checkouts.
- **No surprise prices.** If a price changed since an item was added to the cart, the cart is corrected when it opens, and a checkout that still carries an old price is refused (409) with the new price shown, before any stock is reserved.
- **Newsletter sign-up is double opt-in** (a confirmation email, nothing sent until the owner of the address clicks it, unconfirmed rows deleted after a week) and rate-limited to 10 per hour per connection; broadcasts only go to confirmed addresses. Existing subscribers count as confirmed.
- **Request size caps:** public endpoints accept at most 200 KB; only the admin's data save and newsletter send accept 10 MB.
- **PayFast IP allowlist** uses the proxy-aware client address instead of the raw `X-Forwarded-For` header, which any caller could set to a PayFast address.
- **Database alerts only for real outages.** A dropped connection usually heals within seconds (hosted databases close idle connections), so an alert goes out only if the database is still unreachable after 60 seconds, followed by a "reconnected" note once it is back. Links in alert emails use `PUBLIC_URL`, or else the address real visitors used; they never fall back to localhost (the button is left out if the address is unknown).
- **Process safety:** unhandled rejections are logged to the system log, an uncaught exception alerts you and restarts the process, and SIGTERM finishes in-flight requests before exiting. System logs expire after 180 days.
- **Search:** `/sitemap.xml` is generated from the live catalogue and `/robots.txt` keeps the admin, API, cart and payment pages out of results.
- `npm test` runs unit tests for webhook signatures, Yoco checkout errors, the newsletter sanitiser and logo-tone rules. `npm audit` reports 0 vulnerabilities.
- Known limits: admin sessions live in memory (a restart signs you out; run a single instance), and the storefront sends no Content-Security-Policy.

---

## Favicon, app icons & manifest

All icons are generated from the logo (or favicon) uploaded in Settings (`src/brandIcon.js`); nothing ships with the project.

- **Sharp at every size:** `/favicon.ico` is a real multi-size file (16, 32 and 48 px renditions, not one downscaled image), `/favicon.svg` is offered to browsers that take it, the Apple touch icon (180 px) sits on a solid tile (iOS turns transparency black), and the manifest lists 192 and 512 px icons in both normal and **maskable** form (the logo kept inside the safe zone so Android's circle/squircle crop doesn't cut it).
- **App icons are never blank:** the tile colour is chosen to contrast with the logo (a white logo gets your dark text colour as its tile, a dark logo your page colour), rather than assuming the logo suits the page background; a white logo on a cream tile used to come out as an empty square on iOS. If the logo can't be analysed the tile is a neutral grey that shows both black and white logos, and a failed analysis is retried within 30 seconds instead of being remembered for hours.
- **The store and the admin are separate web apps.** Each has its own manifest (`/manifest.webmanifest` and `/admin.webmanifest`), id, scope (`/` and `/admin/`), start URL, name ("Your Store" and "Your Store Admin"), shortcuts (Shop and Cart; Orders, Products and Site status) and home-screen icon (the admin's is a dark tile with an ADMIN label), so they install, update and sit on a home screen independently. After changing the logo, remove and re-add the home-screen icon: iOS keeps the old one.
- **Follows the browser theme:** the SVG favicon carries a light and a dark version and switches with `prefers-color-scheme` (Chrome, Edge, Firefox). A logo that would vanish on a tab, a black one on a dark tab or a white one on a light tab, becomes a flat white or black silhouette for that theme; one that already contrasts, or has a solid background, is left alone (same rule as the email logos). Without a logo you get a monogram tile that flips in dark mode. Safari uses the ICO and doesn't switch.
- **Browser chrome matches the site:** the storefront's `theme-color` is the page colour you chose (and `color-scheme` follows its brightness, so scrollbars and form controls suit a dark palette); the admin gets a light and a dark `theme-color`, updated live when you flip the admin theme switch.
- **Store manifest** (`/manifest.webmanifest`, the old `/manifest.json` still works): `theme_color` and `background_color` are the page colour (they were the dark primary), plus `id`, `scope`, description, `short_name` (max 12 characters), category and shortcuts.
- Saving Settings refreshes all of this immediately, instead of after the one-minute cache. Resizing needs the logo on Cloudinary; a logo hosted elsewhere is used as it is.

---

## Logos that adapt to the theme

The logo in the storefront header and footer, the admin sidebar and the sign-in page is checked against the surface it sits on (the store's palette, or the admin's light/dark theme). A logo that already contrasts is left exactly as uploaded; one that would disappear (a black logo on a dark surface, a white one on a light surface) is drawn as a flat white or black silhouette instead, and it follows the admin theme toggle live. Logos with a solid background (JPG, opaque PNG) are never altered. Upload a transparent PNG or SVG for best results.

Settings → Homepage also has switches to hide the hero and the **Featured editorial** (lookbook or article promotion) on the home page. See `src/lib/logoTone.js`. (The maintenance page picks black or white for its backdrop; emails do the same job server-side, see **Emails**.)

---

## Emails

Every email is a [React Email](https://react.email) template in `emails/`, built from shadcn/ui-style components (`emails/ui.jsx`: the same zinc palette, 8px radius and type scale as the admin, translated to inline-styled tables because email clients don't do CSS variables or flexbox). Seven templates: new paid order (to you), order updates (to the customer: confirmed, preparing, shipped, delivered, cancelled), new-device sign-in alert, weekly summary, test email, newsletter, and the site-error alert. They share one shell (logo, card, footer with reason-for-receiving, links and postal address), are a single 600px column that goes full-width on phones, and follow the reader's light/dark setting (shadcn's dark theme, via `prefers-color-scheme`: Apple Mail, iOS Mail, Outlook.com and others; Gmail ignores it and applies its own colours). The **logo adapts** too: the server checks the logo once (`src/emailLogo.js`), and if it would vanish on the white or the dark card it prepares a flat white/black version (a Cloudinary colorize transform, transparency kept), then the email shows whichever matches the reader's mode. A logo that already contrasts, one with a solid background, or one not hosted on Cloudinary is used as uploaded in both. The newsletter keeps its card white in dark mode, because the rich text you write carries its own colours.

- `npm run build` compiles them (`emails/dist/`, git-ignored); `npm run emails:preview` renders all of them with sample data into `emails/preview/index.html` at phone and desktop width, with the plain-text version beside each. If the templates were never built the server still sends a plain-text message rather than dropping an order alert.
- **Fewer spam flags, built in:** every email has a real plain-text part rendered from the same template; subjects are sentence case with no brackets, capitals or emoji; no images are embedded as data URIs (the old social icons were); logos and product photos are capped-size PNG/JPG over absolute https URLs with alt text and set dimensions; messages stay under Gmail's ~102 KB clipping limit (6–16 KB today); every email says why you received it; the postal address is in the footer; admin/system mail carries `Auto-Submitted` so auto-responders leave it alone; the newsletter keeps the one-click `List-Unsubscribe` headers and refuses to send without a postal address. Newsletter bodies are sanitised (no scripts, embeds, forms or event handlers, links made absolute), and the admin gets deliverability tips after a send if the subject is shouting, has stacked punctuation, is too long or uses typical spam words.
- Customer-facing text is escaped (product names and notes can no longer inject HTML), and the internal "needs a look" order note is never emailed.
- **Who receives what:** **Settings → Emails & alerts** has two separate lists, each up to 10 addresses separated by commas. **Order notification emails** get the "new paid order" email (the first address is also the contact address shown to customers). **System alert emails** get everything about the site itself: new-device sign-ins, error and database-outage alerts, the weekly summary and log backups. An empty list falls back to the older single list (`adminNotificationEmails`, still honoured for existing stores) and then to `ADMIN_EMAIL`. Addresses are checked as you type and again on the server (a bad one is named in the error and nothing is saved), tidied (lower-cased, de-duplicated) and never exposed to the public site data. The **Send test email** button sends one test to each list.
- **The biggest spam factor is not in the code:** send from a domain you own. `onboarding@resend.dev` is a shared test sender that lands in spam and only delivers to your own address. Verify your domain in Resend (it adds the SPF and DKIM DNS records), add a DMARC record, then set `SMTP_FROM`. The test-email button in Site status tells you if you are still on the sandbox sender.

---

## Product page gallery

Modelled on patta's product page: one list of photos, two layouts. Below 1024px it's a **[Splide](https://splidejs.com) swipe carousel** (bundled, not loaded from a CDN) whose slides are narrower than the screen, so the next photo peeks in; from 1024px Splide switches itself off and the same list is a static **two-column grid** you scroll past, with the buy panel sticky beside it. The zoom view is a second Splide. Every photo is cropped 4:5 with width/height set (no layout shift), the first is eager + high priority and the rest lazy, with a `sizes` that matches the layout. Tapping a photo opens a native `<dialog>` zoom (full-resolution 1920px images are only fetched then; swipe, arrow keys or buttons to move, Esc to close, focus returns to the photo). Colours show as thumbnails of their own first photo (optimised like every other image; a colour without photos falls back to a text button), and a size or colour that is sold out in every combination is struck out immediately. Photos fade in staggered on load (off for reduced-motion users), mobile shows an "n / total" counter, and alt text names the colour and position.

---

## Payments

Two providers sit side by side at checkout — **PayFast** and **Yoco** — and the admin controls them in **Settings → Payments**. A method reaches customers only when it is **switched on there *and* its credentials are set on the server**; the same check runs on the server for every checkout, so a hidden method can't be used by calling the API directly. If exactly one method is available it's preselected; if both are, customers choose. If none are, checkout says so instead of failing, and Settings warns you (use Maintenance mode if you actually want to pause the store). PayFast is on by default and Yoco is opt-in, so existing stores behave exactly as before.

**Yoco** uses the [Checkout API](https://developer.yoco.com/docs/checkout-api): the server creates a hosted checkout (amount in cents, ZAR, with the order reference and line items), the customer is redirected to Yoco, and the result is confirmed by a **signed webhook** — the success redirect is never trusted.

Setup:

1. In the Yoco app, get your Checkout API **secret key** (test keys work immediately; live keys need a verified domain). Set `YOCO_SANDBOX`, `YOCO_SECRET_KEY_TEST` / `_LIVE` in the environment. A live key in test mode (or the reverse) is refused.
2. Register the webhook once: `node scripts/yoco-webhook.js https://your-store.example.com/api/yoco/webhook` (https, publicly reachable — Settings → Payments shows the exact address). It prints a `whsec_…` secret **once**; save it as `YOCO_WEBHOOK_SECRET_TEST` / `_LIVE` and restart.
3. Switch Yoco on in **Settings → Payments**. The card shows *Ready* when the key and webhook secret are in place.

How it stays safe:

- Webhook signatures are verified (HMAC-SHA256 over `id.timestamp.body`, constant-time compare, 3-minute replay window) against the raw request body. Forged, tampered, stale or unsigned calls get 401/400 and are logged (and counted in the weekly summary's suspicious-activity list).
- A verified payment is still checked against the order: matching amount in cents, ZAR, and the right test/live mode. Mismatches are logged as errors and never mark an order paid.
- Marking paid is one atomic status change, so Yoco's retries and duplicate deliveries are harmless (one email, one paid transition). Transient problems (database down) answer 5xx so Yoco retries; permanent ones (unknown checkout) answer 200 so it doesn't.
- If creating the checkout fails (Yoco down, bad key), the order is cancelled and its stock released straight away, the customer sees a plain "try again or use another method" message, and a rejected key emails the admin.
- Customers who cancel or fail a payment land back on the cart **with their cart intact** (it's emptied only once payment succeeds). A payment that arrives after its checkout was cancelled still marks the order paid and re-reserves stock; if the stock is gone the order carries an admin note saying so.
- The "payment successful" page waits for the webhook (polling a status endpoint that returns only paid / pending) rather than assuming success from the URL.
- Orders record which method paid and its reference; both appear in the order detail and on the invoice PDF.

**Abandoned payments.** A customer who reaches the payment page and closes the tab never triggers a cancel or a webhook. Every 5 minutes the server cancels orders that are still unpaid after **Settings → Payments → Release unpaid orders after** (default 60 min, allowed 15 min–24 h) and puts their stock back on sale. Each cancelled order records *why* (customer cancelled, never paid, payment failed) and shows it in the order detail; abandoned ones don't pop a "cancelled" toast and don't count toward the weekly report's cancellation-rate alert. The release is one atomic update per order, so it's safe across restarts and multiple instances, never touches a paid order, and a customer who does pay late (slow bank, delayed webhook) still has their order marked paid with stock re-reserved — for PayFast as well as Yoco. If stock ran out in between, the order carries an admin note to check before shipping. PayFast notices that say *failed/cancelled* can no longer cancel an already-paid order, and repeated PayFast "complete" notices no longer re-send emails.

---

## Order fulfillment

Checkout deducts stock per size/color variant atomically (a conditional `$inc` guard), so two simultaneous checkouts can't both claim the last unit of the same variant. PayFast confirms payment via a server-to-server ITN webhook, independently verified against PayFast's own servers rather than trusted at face value; Yoco confirms via a signed webhook (see **Payments**).

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

## Events & pop-ups

The Community page has an **Events & Pop-ups** section at the top. It is managed only from the admin (**Content → Events**, behind the sign-in): title, event/pop-up type, start/end date and time (South African time, multi-day supported), venue and address, price, description, image, an RSVP/tickets link, and a published switch (drafts stay private). Past events disappear from the site automatically; visitors can **Add to calendar** (.ics) and search engines get Event structured data. Writes and deletes require an admin session, and drafts are never returned to the public API.

## Branding & accessibility

- **Logo everywhere:** the store's logo is used on the loading screen (a static on-brand screen baked into the first HTML by the server, then the in-app `<Loader>`), the admin sidebar/mobile header and sign-in page, and the invoice letterhead. Without a logo the store name is used.
- **Favicon:** the tab icon, apple-touch icon and PWA manifest come from **Settings → Store identity** (favicon, else logo), injected by the server into every page. `/favicon.ico` redirects to it; before a logo is uploaded a generated monogram is shown. No icon file is bundled with the project. (Browsers cache favicons aggressively — hard-refresh or reopen the tab to see a change.)
- **Colours:** the five palette colours are turned into a full token set by `src/lib/theme.js`, which guarantees WCAG contrast for body text (7:1), muted text, link/button hover (including on the dark footer), form borders and focus rings (3:1), and error/success colours — automatically adjusting a colour that would fail. **Settings → Colour palette** shows a live readability check. Keyboard focus is a visible two-tone ring everywhere.

## Media & performance

- **Images:** every Cloudinary image is served through `<Img>` (`src/components/Img.svelte`): responsive `srcset`/`sizes`, AVIF/WebP via `f_auto`, `q_auto`, lazy-loaded and async-decoded, with a fade-in. The hero and main product/article image are `priority` (eager, high fetch priority), and the home hero is also preloaded from the server-rendered HTML.
- **Video:** `<Video>` serves the best codec at 1280/1920px with a poster frame; background videos pause when off-screen and fall back to the poster on Data Saver, 2G or reduced-motion; player videos download nothing until played. YouTube embeds load as a thumbnail and only fetch the real player on click.
- **Editor content** (articles, shipping page) is rewritten on display so its images/videos/iframes get the same treatment.
- **Uploads:** the browser re-encodes photos over ~1.2 MB to WebP (max 2560px) before uploading; Cloudinary also caps stored images at 2560px and pre-generates the video renditions the site requests.
- **Emails** use size-capped JPEG/PNG renditions (no WebP/AVIF, which many mail clients can't show). The admin uses small thumbnails everywhere.
- **Delivery:** responses are gzip/brotli-compressed, the JS bundle is minified (~1 MB → ~330 KB), vendor libs are cached for 30 days, and the Cloudinary connection is opened early with `preconnect`.

## Lookbook

- **Batch upload:** in the lookbook editor, pick or drag in any number of photos and videos at once. Each appears as a row immediately, in the order picked, and fills in as it finishes (photos upload three at a time; videos are compressed by the server one after another, see **Video uploads**). A failed file keeps its row with a **Try again** button, and saving waits until everything has finished. You can still add a single image, video or YouTube/Vimeo embed by hand.
- **Cover image:** optional. With none uploaded, the cover is the first *image* in Media (in the order you arranged it), and failing that a still frame of the first video. The editor shows which one is being used. The same rule applies to the lookbook list, the admin list and the link preview (`og:image`).
- **Vertical and wide media together:** each item stores its pixel size (read in the browser at upload, or from the compressed video; older lookbooks are measured the first time you open them in the admin). The storefront lays media out as a justified flow: every item keeps its own proportions (no cropping; only extreme shapes are limited to 1:2 to 2.4:1), and items pack into rows of equal height. On a phone a wide or square item takes the full width and two vertical ones sit side by side; on desktop wide and vertical items share rows. Media saved without a size is measured by the page and settles into place. The admin shows each item's shape ("Vertical · 9:16", "Horizontal · 16:9"). Lookbook cover cards are cropped to 3:4 around the subject (Cloudinary `g_auto`) rather than through the middle.
- **Mobile:** the lookbook pages use 12–16px side margins on phones instead of 24px.

## Video uploads

Phone and camera video is made for editing, not streaming (30–100 Mbps, 4K, 60 fps, GPS in the metadata), so every video uploaded in the admin (homepage hero, lookbook items, the article editor) is optimised for the web. **Where that work happens depends on your server** (`VIDEO_MODE`):

| Mode | How it works | Use it when |
|---|---|---|
| `cloudinary` (default whenever Cloudinary is configured) | The browser uploads the original **straight to Cloudinary** in signed 6 MB chunks (a dropped connection retries just that chunk) and Cloudinary prepares the web versions: capped at 1280/1920 px, best codec per browser, automatic quality. **Your server does no video work at all**: no ffmpeg, no large upload through it, no memory or CPU spike. | A small instance such as **Render's 512 MB / 0.5 CPU**. This is the recommended setup. |
| `server` | The file is uploaded to your server and compressed with ffmpeg (below) before only the small result goes to Cloudinary. On a server with under about 1.5 GB of memory it automatically switches to a **lite profile**: 720p, a fast preset, one thread, and smaller limits (150 MB, 5 minutes). | A server with real CPU and RAM, or local development without Cloudinary. |

In `cloudinary` mode the limit is `VIDEO_MAX_MB` (default **100**, which is Cloudinary's free-plan limit per video; raise it if your plan allows more). The admin shows "Uploaded (13.4 MB · 1080×1920). Optimised web versions are prepared in the background"; large videos can take a minute or two to be ready, and until then a visitor is simply given the original file, so nothing breaks. The sound-removal option and the compression statistics only exist in `server` mode. Cloudinary also keeps your original upload, but the site only ever links to the optimised versions. GIFs are uploaded as animated images. On Render you can add `--omit=optional` to the build's `npm install` to skip downloading ffmpeg if you only use `cloudinary` mode.

The `server` mode pipeline (`src/videoPipeline.js`):

- **Format:** H.264 High, constant-quality (CRF 23–25) held under a bitrate ceiling (about 5 Mbps at 1080p, 2.8 at 720p), so quality is steady and busy footage can't balloon. It plays in every browser and on every phone.
- **Size:** fitted inside 1920×1080 (portrait: 1080×1920), never upscaled, frame rate capped at 30 fps, `yuv420p` with BT.709 colour tags. iPhone / HDR footage is tone-mapped to SDR so it doesn't look washed out (if the tone-mapping chain fails on a given file it retries without it).
- **Streaming:** `+faststart` so playback begins before the download ends, a keyframe every 2 s so seeking is quick. Slower, better presets are used for short clips and faster ones for long clips.
- **Privacy:** all metadata, chapters, subtitles and data tracks are stripped (no GPS or device info). The admin can also remove the audio track, which suits muted background videos (about 10% smaller).
- **Smart skipping:** an MP4 that is already web-ready (H.264, within 1080p, 30 fps or less) is published as it is when re-encoding would not make it meaningfully smaller. GIFs become MP4s.
- **Result:** typical camera footage comes out 80–95% smaller (a 29.5 MB 4K/60 clip became 1.6 MB, SSIM 0.996). After publishing, Cloudinary also pre-generates 1280/1920 renditions and the site serves the best codec per browser (`f_auto`: VP9/AV1/H.264).
- **In the admin:** drag a file onto the uploader. It shows upload progress, then compression progress, then "29.5 MB → 1.6 MB (95% smaller) · 1080p · 30 fps". Jobs run one at a time in a queue (compression is CPU-heavy), the upload returns immediately and the admin follows the job, so a long video never hits a request timeout. Limits: `VIDEO_MAX_MB` (default 500) and `VIDEO_MAX_MINUTES` (default 20). Errors are phrased for people ("That file could not be read as a video").
- **ffmpeg:** comes from the `ffmpeg-static` optional dependency (installed by `npm install` on Render and most hosts), or set `FFMPEG_PATH`, or have `ffmpeg` on the PATH. If none is available the uploader says so and falls back to publishing the original (Cloudinary's 100 MB single-video limit applies).
- **Developing without Cloudinary:** set `VIDEO_LOCAL_DIR=./tmp-uploads` (ignored when `NODE_ENV=production`) to keep uploaded photos and compressed videos locally and serve them from `/dev-uploads`.

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
