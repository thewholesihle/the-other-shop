'use strict';
const mongoose = require('mongoose');

// ── Settings (single document, _id = 'main') ─────────────────────────────────
const SettingsSchema = new mongoose.Schema({
  _id:          { type: String, default: 'main' },
  name:         { type: String, default: 'Others.' },
  metaTitle:    { type: String, default: '' },
  metaDescription: { type: String, default: '' },
  // Default social share thumbnail — used whenever a page (or product/article/
  // lookbook) doesn't have a more specific image of its own. Distinct from `logo`,
  // which is usually a wordmark/icon and rarely a good 1200x630 share thumbnail.
  ogImage:      { type: String, default: '' },
  tagline:      { type: String, default: '' },
  description:  { type: String, default: '' },
  announcement: { type: String, default: '' },
  currency:     { type: String, default: 'R' },
  logo:         { type: String, default: '' },
  hero: {
    // false = no full-screen hero; the home page leads with the New Arrivals grid instead.
    enabled:    { type: Boolean, default: true },
    label:      { type: String, default: '' },
    heading:    { type: String, default: '' },
    subheading: { type: String, default: '' },
    cta:        { type: String, default: '' },
    ctaLink:    { type: String, default: '/shop' },
    image:      { type: String, default: '' },
    video:      { type: String, default: '' },
  },
  // Which payment methods the storefront offers. A method is only really offered when it is both
  // switched on here AND configured on the server (keys in the environment) — see /api/payment-methods.
  payments: {
    payfast: { enabled: { type: Boolean, default: true } },
    yoco:    { enabled: { type: Boolean, default: false } },
    // An order still unpaid after this long is treated as abandoned: it's cancelled and its stock goes back on sale.
    abandonAfterMinutes: { type: Number, default: 60 },
  },
  shipping: {
    freeMinimum:  { type: Number, default: 500 },
    standardRate: { type: Number, default: 99 },
    country:      { type: String, default: 'South Africa' },
  },
  colors: {
    background: { type: String, default: '' },
    foreground: { type: String, default: '' },
    primary:    { type: String, default: '' },
    border:     { type: String, default: '' },
    hover:      { type: String, default: '' },
  },
  socials: {
    instagram: { type: String, default: '' },
    twitter:   { type: String, default: '' },
    tiktok:    { type: String, default: '' },
    youtube:   { type: String, default: '' },
  },
  footerLogo:    { type: String, default: '' },
  footerTagline: { type: String, default: '' },
  maintenance: {
    enabled:       { type: Boolean, default: false },
    collectEmails: { type: Boolean, default: false },
    title:         { type: String, default: 'We\'ll be back soon.' },
    message:       { type: String, default: 'Our store is currently undergoing scheduled maintenance. Please check back shortly.' },
    background:    { type: String, default: '' },
  },
  // false = the home page shows no featured lookbook/article section at all.
  featuredEditorialEnabled: { type: Boolean, default: true },
  featuredLookbook: { type: String, default: '' },
  featuredEditorialType: { type: String, default: 'lookbook' }, // 'lookbook' | 'article'
  featuredEditorialHeading: { type: String, default: '' },
  featuredEditorialMessage: { type: String, default: '' },
  featuredEditorialCta:     { type: String, default: '' },
  navLogoSize:    { type: Number, default: 28 },
  favicon:       { type: String, default: '' },
  emailLogo:     { type: String, default: '' },
  emailTemplates: {
    paid:      { type: String, default: 'Your payment for order {orderId} has been confirmed. We are now preparing your items for dispatch.' },
    processing: { type: String, default: 'We are currently processing your order {orderId}. You will be notified once it has been shipped.' },
    shipped:   { type: String, default: 'Great news! Your order {orderId} has been shipped and is on its way to you.' },
    delivered: { type: String, default: 'Your order {orderId} has been delivered. We hope you enjoy your new pieces!' },
    cancelled: { type: String, default: 'Your order {orderId} has been cancelled. If you have any questions, please contact our support team.' },
  },
  // Who receives what. Order emails (a new paid order) and system alerts (security, errors, database, weekly summary) have
  // their own lists. Empty = fall back to the older single list below, then to ADMIN_EMAIL.
  orderNotificationEmails: { type: String, default: '' },
  systemAlertEmails:       { type: String, default: '' },
  adminNotificationEmails: { type: String, default: 'othersworldwide@gmail.com' }, // the original single list (kept as the fallback)
}, { strict: true, _id: false, versionKey: false });

// ── Category ──────────────────────────────────────────────────────────────────
const CategorySchema = new mongoose.Schema({
  id:   { type: String, required: true, unique: true },
  name: { type: String, required: true },
  slug: { type: String, required: true },
}, { strict: true, versionKey: false });

// ── Product ───────────────────────────────────────────────────────────────────
const VariantSchema = new mongoose.Schema({
  size:  { type: String, default: '' },
  color: { type: String, default: '' },
  stock: { type: Number, default: 0, min: 0 },
}, { _id: false, strict: true });

const ColorImageSchema = new mongoose.Schema({
  color:  { type: String, required: true },
  images: [{ type: String }],
}, { _id: false, strict: true });

const ProductSchema = new mongoose.Schema({
  id:          { type: String, required: true, unique: true },
  name:        { type: String, required: true, trim: true },
  category:    { type: String, required: true },
  price:       { type: Number, required: true, min: 0 },
  image:       { type: String, default: '' },
  images:      [{ type: String }], // default/fallback gallery, shown when a color has no images of its own
  description: { type: String, default: '' },
  sizes:       [{ type: String }],
  colors:      [{ type: String }],
  // Per-color product photos — e.g. a "Black" gallery vs a "White" gallery — shown
  // on the product page once that color is selected, falling back to `images`.
  colorImages: [ColorImageSchema],
  // `stock` is a denormalized total kept in sync with `variants` (sum of all variant stock).
  // `variants` is the source of truth for per size/color availability.
  stock:       { type: Number, default: 0, min: 0 },
  variants:    [VariantSchema],
  // Bumped by every stock change (a sale, a restock, an admin edit). The admin's product save uses it to notice a
  // sale that landed mid-save and merge with it instead of overwriting it.
  rev:         { type: Number, default: 0 },
  isNew:       { type: Boolean, default: false },
  isFeatured:  { type: Boolean, default: false },
}, { strict: true, versionKey: false, suppressReservedKeysWarning: true });

// ── Order ─────────────────────────────────────────────────────────────────────
const OrderItemSchema = new mongoose.Schema({
  id:       String,
  // Must be declared: strict mode silently drops undeclared fields, and the stock-
  // restore code looks items up by productId || id.
  productId: String,
  name:     String,
  price:    Number,
  quantity: Number,
  size:     String,
  color:    { type: String, default: '' },
  image:    String,
}, { _id: false, strict: true });

const OrderSchema = new mongoose.Schema({
  id:           { type: String, required: true, unique: true },
  customer:     { type: String, default: '' },
  email:        { type: String, default: '' },
  phone:        { type: String, default: '' },
  address:      { type: String, default: '' },
  items:        [OrderItemSchema],
  total:        { type: Number, default: 0 },
  shippingCost: { type: Number, default: 0 },
  status:       { type: String, default: 'pending', enum: ['pending', 'pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'] },
  payfastId:    { type: String, default: '' },
  // Secret handed only to the buyer's browser at checkout; needed to cancel the order or poll its payment state, so
  // knowing an order number (they are timestamps) isn't enough to interfere with someone else's checkout.
  // Never returned by normal queries (select: false) — the admin blob can't leak it.
  token:        { type: String, default: '', select: false },
  // How this order is paid. '' on orders created before online methods were recorded.
  paymentMethod: { type: String, default: '', enum: ['', 'payfast', 'yoco'] },
  // Why a cancelled order was cancelled: the customer backed out, they never paid (abandoned), the
  // payment failed / couldn't be started, or '' (cancelled by the admin, or before this was recorded).
  cancelReason: { type: String, default: '', enum: ['', 'customer', 'abandoned', 'payment_failed'] },
  yocoCheckoutId: { type: String, default: '', index: true }, // links Yoco's webhook back to the order
  yocoPaymentId:  { type: String, default: '' },
  adminNote:    { type: String, default: '' }, // shown to the customer in their status email
  // For the admin only, never emailed: set automatically when something needs a human look (e.g. a late payment
  // arrived after its stock was released and could not be fully re-reserved).
  internalNote: { type: String, default: '' },
  // Shipment details — entered manually by the admin when marking an order 'shipped',
  // and surfaced as reference info in the customer status email.
  carrier:           { type: String, default: '' },
  trackingNumber:    { type: String, default: '' },
  estimatedDelivery: { type: String, default: '' },
  // Structured delivery address, collected at checkout alongside (not instead of)
  // `address` above — `address` stays the free-text display string used by emails
  // and the admin order list; kept separately so each part is available on its own, since
  // handy for packing/addressing a parcel without re-parsing the free-text blob.
  deliveryStreet:     { type: String, default: '' },
  deliveryCity:       { type: String, default: '' },
  deliveryProvince:   { type: String, default: '' },
  deliveryPostalCode: { type: String, default: '' },
  deliveryCountry:    { type: String, default: 'ZA' },
  createdAt:    { type: Date, default: Date.now },
}, { strict: true, versionKey: false });

// ── Lookbook ──────────────────────────────────────────────────────────────────
const LookbookItemSchema = new mongoose.Schema({
  type:    { type: String, enum: ['image', 'video', 'embed'], default: 'image' },
  url:     { type: String, default: '' },
  caption: { type: String, default: '' },
  // Pixel size of the media (0 = unknown). Lets the storefront lay out vertical and wide media at their true shape before they load.
  width:   { type: Number, default: 0, min: 0, max: 20000 },
  height:  { type: Number, default: 0, min: 0, max: 20000 },
}, { _id: false, strict: true });

const LookbookSchema = new mongoose.Schema({
  id:          { type: String, required: true, unique: true },
  title:       { type: String, required: true },
  description: { type: String, default: '' },
  date:        { type: String, default: '' },
  coverImage:  { type: String, default: '' },
  items:       [LookbookItemSchema],
}, { strict: true, versionKey: false });

// ── Community Article ─────────────────────────────────────────────────────────
const ArticleSchema = new mongoose.Schema({
  id:        { type: String, required: true, unique: true },
  slug:      { type: String, required: true, unique: true },
  title:     { type: String, required: true, trim: true },
  excerpt:   { type: String, default: '' },
  content:   { type: String, default: '' }, // stored as HTML from rich editor
  author:    { type: String, default: '' },
  date:      { type: String, default: '' },
  category:  { type: String, default: '' },
  image:     { type: String, default: '' },
  published: { type: Boolean, default: false },
}, { strict: true, versionKey: false });

// ── Pages (single document, _id = 'main') ────────────────────────────────────
const FaqItemSchema = new mongoose.Schema({
  id:       String,
  question: String,
  answer:   String,
}, { _id: false });

const ContactDetailSchema = new mongoose.Schema({
  id:    String,
  label: String,
  value: String,
}, { _id: false });

const PagesSchema = new mongoose.Schema({
  _id: { type: String, default: 'main' },
  shipping: {
    content: { type: String, default: '' },
  },
  faq: {
    items: [FaqItemSchema],
  },
  contact: {
    address: { type: String, default: '' },
    details: [ContactDetailSchema],
  },
}, { strict: true, _id: false, versionKey: false });

// ── Subscriber ────────────────────────────────────────────────────────────────
const SubscriberSchema = new mongoose.Schema({
  id:    { type: String, required: true, unique: true },
  // Double opt-in: false until the address owner clicks the link we email them. Rows from before this existed have
  // no value and count as confirmed. Unconfirmed rows are deleted after a week.
  confirmed:   { type: Boolean, default: true },
  requestedAt: { type: Date, default: Date.now },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^[^@]+@[^@]+\.[^@]+$/, 'Invalid email'],
  },
  date: { type: String, default: () => new Date().toISOString().slice(0, 10) },
}, { strict: true, versionKey: false });

// ── Site Log ─────────────────────────────────────────────────────────────────
const LogSchema = new mongoose.Schema({
  id:        { type: String, required: true, unique: true },
  timestamp: { type: Date, default: Date.now },
  type:      { type: String, enum: ['info', 'warn', 'error'], default: 'info' },
  message:   { type: String, required: true },
  context:   { type: String, default: '' }, // e.g. 'API', 'PAYMENT', 'STOCK'
  data:      { type: mongoose.Schema.Types.Mixed, default: {} },
}, { strict: true, versionKey: false });
// Logs expire after 180 days (the weekly backups keep the history), so the collection can't grow without bound.
LogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 180 * 86400 });

// ── Event / pop-up (community page; managed only from the admin) ──────────────
// Dates and times are wall-clock values in the store's timezone (South Africa, UTC+2, no DST), kept
// as plain strings ("2026-10-18", "18:00") exactly as entered — no timezone conversion surprises.
const EventSchema = new mongoose.Schema({
  id:          { type: String, required: true, unique: true },
  kind:        { type: String, enum: ['event', 'popup'], default: 'event' },
  title:       { type: String, required: true, trim: true },
  date:        { type: String, required: true },            // YYYY-MM-DD (first day)
  startTime:   { type: String, default: '' },               // HH:mm, optional (blank = all day)
  endDate:     { type: String, default: '' },               // YYYY-MM-DD, optional (multi-day pop-ups)
  endTime:     { type: String, default: '' },               // HH:mm, optional
  venue:       { type: String, default: '' },
  address:     { type: String, default: '' },
  city:        { type: String, default: '' },
  price:       { type: String, default: '' },               // free text: "Free", "R150"…
  description: { type: String, default: '' },
  image:       { type: String, default: '' },
  link:        { type: String, default: '' },               // RSVP / tickets / more info
  linkLabel:   { type: String, default: '' },
  published:   { type: Boolean, default: true },
}, { strict: true, versionKey: false });

// ── Log backup ───────────────────────────────────────────────────────────────
// A gzip-compressed JSON snapshot of log entries, kept independently of the live `logs`
// collection so clearing or losing the logs doesn't lose the history. `kind: 'email'`
// rows carry no data — they only record how far the emailed (off-site) copy has reached.
const LogBackupSchema = new mongoose.Schema({
  id:        { type: String, required: true, unique: true },
  kind:      { type: String, enum: ['snapshot', 'email'], default: 'snapshot' },
  reason:    { type: String, default: 'scheduled' }, // scheduled | manual | before-clear
  createdAt: { type: Date, default: Date.now },
  from:      { type: Date, default: null },  // oldest log entry included
  to:        { type: Date, default: null },  // newest log entry included
  count:     { type: Number, default: 0 },
  bytes:     { type: Number, default: 0 },   // compressed size
  data:      { type: Buffer, select: false },
}, { strict: true, versionKey: false });

// ── Exports ───────────────────────────────────────────────────────────────────
module.exports = {
  Settings:   mongoose.model('Settings',   SettingsSchema,   'settings'),
  Category:   mongoose.model('Category',   CategorySchema,   'categories'),
  Product:    mongoose.model('Product',    ProductSchema,    'products'),
  Order:      mongoose.model('Order',      OrderSchema,      'orders'),
  Lookbook:   mongoose.model('Lookbook',   LookbookSchema,   'lookbooks'),
  Article:    mongoose.model('Article',    ArticleSchema,    'articles'),
  Pages:      mongoose.model('Pages',      PagesSchema,      'pages'),
  Subscriber: mongoose.model('Subscriber', SubscriberSchema, 'subscribers'),
  Log:        mongoose.model('Log',        LogSchema,        'logs'),
  Event:      mongoose.model('Event',      EventSchema,      'events'),
  LogBackup:  mongoose.model('LogBackup',  LogBackupSchema,  'logbackups'),
};
