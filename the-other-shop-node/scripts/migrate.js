#!/usr/bin/env node
/**
 * One-time migration: store.json → MongoDB
 * Safe to run multiple times (idempotent — uses upsert).
 *
 * Usage:
 *   node scripts/migrate.js
 *   (or: npm run migrate)
 */

'use strict';
require('dotenv').config();
const path = require('path');
const fs   = require('fs');
const mongoose = require('mongoose');

const { connect } = require('../src/db/connection');
const { Settings, Category, Product, Order, Lookbook, Article, Pages, Subscriber } = require('../src/db/models');

const STORE_JSON = path.join(__dirname, '..', 'public', 'data', 'store.json');

async function run() {
  await connect();
  console.log('\n── Migrating store.json → MongoDB ──\n');

  let store;
  try {
    store = JSON.parse(fs.readFileSync(STORE_JSON, 'utf8'));
  } catch (e) {
    console.error('Could not read store.json:', e.message);
    process.exit(1);
  }

  // 1. Settings (upsert single doc)
  const s = store.site ?? {};
  await Settings.findOneAndUpdate(
    { _id: 'main' },
    { $set: {
        name: s.name, tagline: s.tagline, description: s.description,
        announcement: s.announcement, currency: s.currency, logo: s.logo,
        hero: s.hero, shipping: s.shipping, socials: s.socials,
    }},
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
  console.log('✓ settings');

  // 2. Categories
  const cats = store.categories ?? [];
  for (const c of cats) {
    await Category.findOneAndUpdate({ id: c.id }, { $set: c }, { upsert: true });
  }
  console.log(`✓ categories (${cats.length})`);

  // 3. Products
  const prods = store.products ?? [];
  for (const p of prods) {
    await Product.findOneAndUpdate({ id: p.id }, { $set: p }, { upsert: true });
  }
  console.log(`✓ products (${prods.length})`);

  // 4. Orders
  const orders = store.orders ?? [];
  for (const o of orders) {
    if (!o.id) continue;
    await Order.findOneAndUpdate({ id: o.id }, { $set: o }, { upsert: true });
  }
  console.log(`✓ orders (${orders.length})`);

  // 5. Lookbooks
  const lookbooks = store.lookbooks ?? [];
  for (const lb of lookbooks) {
    // Migrate legacy images[] to items[]
    if (!lb.items && lb.images) {
      lb.items = lb.images.map(url => ({ type: 'image', url, caption: '' }));
    }
    await Lookbook.findOneAndUpdate({ id: lb.id }, { $set: lb }, { upsert: true });
  }
  console.log(`✓ lookbooks (${lookbooks.length})`);

  // 6. Community articles
  const articles = store.community ?? [];
  for (const a of articles) {
    await Article.findOneAndUpdate({ id: a.id }, { $set: a }, { upsert: true });
  }
  console.log(`✓ articles (${articles.length})`);

  // 7. Pages
  const pages = store.pages ?? {};
  await Pages.findOneAndUpdate(
    { _id: 'main' },
    { $set: {
        shipping: pages.shipping ?? { content: '' },
        faq:      pages.faq      ?? { items: [] },
        contact:  pages.contact  ?? { address: '', details: [] },
    }},
    { upsert: true, setDefaultsOnInsert: true }
  );
  console.log('✓ pages');

  // 8. Subscribers
  const subs = store.subscribers ?? [];
  for (const sub of subs) {
    if (!sub.email) continue;
    await Subscriber.findOneAndUpdate(
      { email: sub.email.toLowerCase() },
      { $set: sub },
      { upsert: true }
    );
  }
  console.log(`✓ subscribers (${subs.length})`);

  console.log('\n✅ Migration complete.\n');
  await mongoose.connection.close();
  process.exit(0);
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
