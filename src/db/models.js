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
    label:      { type: String, default: '' },
    heading:    { type: String, default: '' },
    subheading: { type: String, default: '' },
    cta:        { type: String, default: '' },
    ctaLink:    { type: String, default: '/shop' },
    image:      { type: String, default: '' },
    video:      { type: String, default: '' },
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
  adminNotificationEmails: { type: String, default: 'othersworldwide@gmail.com' },
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
  isNew:       { type: Boolean, default: false },
  isFeatured:  { type: Boolean, default: false },
}, { strict: true, versionKey: false, suppressReservedKeysWarning: true });

// ── Order ─────────────────────────────────────────────────────────────────────
const OrderItemSchema = new mongoose.Schema({
  id:       String,
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
  adminNote:    { type: String, default: '' },
  // Shipment details — set by admin when marking an order 'shipped', surfaced as
  // reference info in the customer status email (no tracking-link CTA — no courier
  // integration or tracking page exists yet to justify a clickable "track" button).
  carrier:           { type: String, default: '' },
  trackingNumber:    { type: String, default: '' },
  estimatedDelivery: { type: String, default: '' },
  createdAt:    { type: Date, default: Date.now },
}, { strict: true, versionKey: false });

// ── Lookbook ──────────────────────────────────────────────────────────────────
const LookbookItemSchema = new mongoose.Schema({
  type:    { type: String, enum: ['image', 'video', 'embed'], default: 'image' },
  url:     { type: String, default: '' },
  caption: { type: String, default: '' },
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
};
